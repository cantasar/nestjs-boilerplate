// Static checks for the Deploy workflow switch and the AWS Terraform (task aws-deploy-switch).
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const WORKFLOW = readFileSync(
  join(ROOT, '.github', 'workflows', 'deploy.yml'),
  'utf8',
);
const AWS = join(ROOT, 'infra', 'aws');
const tf = (path: string) => readFileSync(join(AWS, path), 'utf8');

/** Top-level job blocks of the workflow, keyed by job id. */
function jobs(): Map<string, string> {
  const body = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n') + 7);
  const result = new Map<string, string>();
  let current = '';
  for (const line of body.split('\n')) {
    const id = /^ {2}([a-z][\w-]*):\s*$/.exec(line)?.[1];
    if (id) current = id;
    else if (current)
      result.set(current, `${result.get(current) ?? ''}${line}\n`);
  }
  return result;
}

const job = (id: string) => jobs().get(id) ?? '';

const jobIf = (block: string) => /^ {4}if: (.+)$/m.exec(block)?.[1] ?? '';

/** Evaluates the `vars.DEPLOY_TARGET ==/!= 'x'` joined by && that the jobs use. GitHub compares strings case-insensitively. */
function runs(condition: string, target: string): boolean {
  return condition.split('&&').every((part) => {
    const m = /^\s*vars\.DEPLOY_TARGET\s*(==|!=)\s*'([^']*)'\s*$/.exec(part);
    if (!m) throw new Error(`Unexpected condition part: ${part}`);
    const equal = target.toLowerCase() === (m[2] ?? '').toLowerCase();
    return m[1] === '==' ? equal : !equal;
  });
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('Deploy workflow switch', () => {
  it('only runs by hand (workflow_dispatch), never on push, tag or schedule', () => {
    const on = WORKFLOW.slice(
      WORKFLOW.indexOf('\non:\n'),
      WORKFLOW.indexOf('\nconcurrency:'),
    );
    expect(on).toContain('workflow_dispatch');
    expect(on).not.toMatch(
      /\b(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch|release|workflow_call)\s*:/,
    );
  });

  it('has exactly the disabled, gcp and aws jobs', () => {
    expect([...jobs().keys()].sort()).toEqual(['aws', 'disabled', 'gcp']);
  });

  it('runs exactly one job for every DEPLOY_TARGET value, and deploys only for gcp or aws', () => {
    const all = jobs();
    const values = [
      '',
      'none',
      'off',
      'azure',
      'gcp',
      'aws',
      'GCP',
      'Aws',
      ' aws',
      'gcp,aws',
    ];
    const picked = values.map((value) => [
      value,
      [...all]
        .filter(([, block]) => runs(jobIf(block), value))
        .map(([id]) => id),
    ]);
    expect(picked).toEqual(
      values.map((value) => {
        const v = value.toLowerCase();
        return [value, [v === 'gcp' || v === 'aws' ? v : 'disabled']];
      }),
    );
  });

  it('makes the disabled job fail at once with a clear message and no secrets', () => {
    const disabled = job('disabled');
    expect(disabled).toMatch(/::error::Deploy is off/);
    expect(disabled).toMatch(/exit 1/);
    expect(disabled).not.toMatch(/environment:|id-token|secrets\.|uses:/);
  });

  it('gives OIDC and environment protection only to the deploy jobs', () => {
    for (const block of [job('gcp'), job('aws')]) {
      expect(block).toMatch(
        /^ {4}environment: \$\{\{ inputs\.environment \}\}$/m,
      );
      expect(block).toMatch(/id-token: write/);
    }
    expect(WORKFLOW).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  it('keeps ${{ }} out of run scripts (no script injection)', () => {
    const runBlocks: string[] = [];
    const lines = WORKFLOW.split('\n');
    lines.forEach((line, i) => {
      const m = /^(\s*)(- )?run: (.*)$/.exec(line);
      if (!m) return;
      const indent = (m[1] ?? '').length + (m[2] ? 2 : 0);
      let block = m[3] ?? '';
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j] ?? '';
        if (next.trim() !== '' && next.search(/\S/) <= indent) break;
        block += `\n${next}`;
      }
      runBlocks.push(block);
    });
    expect(runBlocks.length).toBeGreaterThan(5);
    expect(runBlocks.filter((block) => block.includes('${{'))).toEqual([]);
  });

  // ECS circuit breaker rolls back a bad deploy, and `services-stable` then succeeds on the old revision.
  it('fails the AWS deploy when ECS rolls back instead of running the new task definition', () => {
    const aws = job('aws');
    const afterWait = aws.slice(aws.indexOf('aws ecs wait services-stable'));
    expect(afterWait).toMatch(
      /aws ecs describe-services[^\n]*--output json \\\n\s*\| jq -e --arg ARN "\$NEW_ARN"/,
    );
    expect(afterWait).toMatch(/\|\| \{ echo "::error::[^"]*"; exit 1; \}/);
  });

  // Runs the jq filter from the workflow on ECS describe-services shapes. jq -e fails on false, null and no output.
  it('accepts only a PRIMARY deployment on the new task definition with rollout COMPLETED', () => {
    const filter = /jq -e --arg ARN "\$NEW_ARN" \\\n\s*'([^']+)'/.exec(
      job('aws'),
    )?.[1];
    expect(filter).toBeDefined();
    const NEW = 'arn:aws:ecs:r:1:task-definition/api:5';
    const OLD = 'arn:aws:ecs:r:1:task-definition/api:4';
    const dep = (status: string, td: string, rollout: string) => ({
      status,
      taskDefinition: td,
      rolloutState: rollout,
    });
    const passes = (input: string) => {
      const r = spawnSync('jq', ['-e', '--arg', 'ARN', NEW, filter ?? '.'], {
        input,
        encoding: 'utf8',
      });
      if (r.error)
        throw new Error(`jq is needed for this test: ${r.error.message}`);
      return r.status === 0;
    };
    const svc = (deployments: unknown[]) =>
      JSON.stringify({ services: [{ deployments }] });
    expect(passes(svc([dep('PRIMARY', NEW, 'COMPLETED')]))).toBe(true);
    expect({
      rolledBack: passes(svc([dep('PRIMARY', OLD, 'COMPLETED')])),
      rollingBack: passes(
        svc([dep('PRIMARY', OLD, 'IN_PROGRESS'), dep('ACTIVE', NEW, 'FAILED')]),
      ),
      failed: passes(svc([dep('PRIMARY', NEW, 'FAILED')])),
      inProgress: passes(svc([dep('PRIMARY', NEW, 'IN_PROGRESS')])),
      noDeployments: passes(svc([])),
      noService: passes(JSON.stringify({ services: [] })),
      emptyInput: passes(''),
    }).toEqual({
      rolledBack: false,
      rollingBack: false,
      failed: false,
      inProgress: false,
      noDeployments: false,
      noService: false,
      emptyInput: false,
    });
  });

  // A short SHA can clash, and the AWS job reuses an image whose tag already exists.
  it('tags images with the full commit SHA', () => {
    expect(job('aws')).toMatch(/TAG="\$GITHUB_SHA"\n/);
    expect(job('gcp')).toMatch(/\/api:\$\{GITHUB_SHA\}"/);
    expect(WORKFLOW).not.toMatch(/GITHUB_SHA::|cut -c|SHORT_SHA|head -c/);
  });
});

describe('AWS Terraform: deploy role scope', () => {
  const iam = tf('modules/iam/main.tf');

  it('trusts only GitHub OIDC tokens for sts.amazonaws.com from one environment of one repo', () => {
    expect(iam).toMatch(/sts:AssumeRoleWithWebIdentity/);
    expect(iam).toMatch(
      /test\s*=\s*"StringEquals"\s*\n\s*variable\s*=\s*"token\.actions\.githubusercontent\.com:aud"\s*\n\s*values\s*=\s*\["sts\.amazonaws\.com"\]/,
    );
    expect(iam).toMatch(
      /test\s*=\s*"StringEquals"\s*\n\s*variable\s*=\s*"token\.actions\.githubusercontent\.com:sub"\s*\n\s*values\s*=\s*\["repo:\$\{var\.github_repository\}:environment:\$\{var\.github_environment\}"\]/,
    );
    expect(iam).not.toMatch(/StringLike/);
  });

  it('uses "*" only for actions that cannot be scoped', () => {
    const statements = iam
      .slice(iam.indexOf('data "aws_iam_policy_document" "deploy"'))
      .split(/\n\s*statement\s*\{/)
      .slice(1);
    const star = statements
      .filter((s) => /resources\s*=\s*\["\*"\]/.test(s))
      .map((s) => /sid\s*=\s*"(\w+)"/.exec(s)?.[1]);
    expect(star.sort()).toEqual(['EcrLogin', 'EcsTaskDefinitions']);
    expect(iam).toMatch(/actions\s*=\s*\["ecr:GetAuthorizationToken"\]/);
    expect(iam).toMatch(
      /actions\s*=\s*\["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"\]/,
    );
  });

  it('lets the deploy role pass only the two task roles, only to ECS tasks', () => {
    expect(iam).toMatch(
      /actions\s*=\s*\["iam:PassRole"\]\s*\n\s*resources\s*=\s*\[aws_iam_role\.execution\.arn, aws_iam_role\.task\.arn\]/,
    );
    expect(iam).toMatch(/iam:PassedToService[\s\S]*ecs-tasks\.amazonaws\.com/);
    expect(iam).not.toMatch(
      /ecs:RunTask|ecs:\*|iam:\*|"\*"\s*\]\s*\n\s*resources/,
    );
  });

  // One stack per environment: a role that trusts staging lets an unreviewed staging run deploy to production.
  it('makes every stack name its one GitHub environment, with no default', () => {
    const block = (text: string, name: string) => {
      const start = text.indexOf(`variable "${name}" {`);
      return start < 0 ? '' : text.slice(start, text.indexOf('\n}', start));
    };
    for (const file of [
      'envs/example/variables.tf',
      'modules/iam/variables.tf',
    ]) {
      const v = block(tf(file), 'github_environment');
      expect({ file, declared: v !== '' }).toEqual({ file, declared: true });
      expect(v).toMatch(/type\s*=\s*string/);
      expect(v).not.toMatch(/default\s*=/);
    }
    expect(tf('envs/example/main.tf')).toMatch(
      /github_environment\s*=\s*var\.github_environment/,
    );
    expect(tf('envs/example/terraform.tfvars.example')).toMatch(
      /^github_environment\s*=/m,
    );
    const stale = filesUnder(AWS).filter((f) =>
      readFileSync(f, 'utf8').includes('github_environments'),
    );
    expect(stale).toEqual([]);
  });

  it('rejects a list or a wildcard as github_environment', () => {
    const v = tf('envs/example/variables.tf');
    const regex = /can\(regex\("([^"]+)", var\.github_environment\)\)/.exec(
      v,
    )?.[1];
    expect(regex).toBeDefined();
    const pattern = new RegExp((regex ?? '').replace(/\\\\/g, '\\'));
    expect(
      ['staging', 'production', 'prod-eu_1'].map((e) => pattern.test(e)),
    ).toEqual([true, true, true]);
    expect(
      ['*', 'staging,production', 'staging production', '', 'a:b', 'st*'].map(
        (e) => pattern.test(e),
      ),
    ).toEqual([false, false, false, false, false, false]);
  });
});

describe('AWS Terraform: no secrets and no surprise rollouts', () => {
  const files = filesUnder(AWS).filter((f) => f.endsWith('.tf'));

  it('never stores a secret value or password in Terraform', () => {
    const bad = files.filter((f) =>
      /aws_secretsmanager_secret_version|secret_string|\bpassword\s*=|auth_token\s*=/.test(
        readFileSync(f, 'utf8'),
      ),
    );
    expect(bad).toEqual([]);
  });

  it('lets CI own the task definition and keeps data stores private and protected', () => {
    expect(tf('modules/ecs_service/main.tf')).toMatch(
      /ignore_changes\s*=\s*\[task_definition\]/,
    );
    const rds = tf('modules/rds/main.tf');
    expect(rds).toMatch(/publicly_accessible\s*=\s*false/);
    expect(rds).toMatch(/manage_master_user_password\s*=\s*true/);
    expect(rds).toMatch(/prevent_destroy\s*=\s*true/);
    expect(tf('modules/elasticache/main.tf')).toMatch(
      /transit_encryption_enabled\s*=\s*true/,
    );
  });

  it('lets only the ALB reach the tasks', () => {
    const ecs = tf('modules/ecs_service/main.tf');
    const ingress = ecs.match(
      /resource "aws_vpc_security_group_ingress_rule"/g,
    );
    expect(ingress).toHaveLength(1);
    expect(ecs).toMatch(
      /referenced_security_group_id\s*=\s*var\.alb_security_group_id/,
    );
  });

  it('keeps project values out of the modules', () => {
    const modules = files.filter((f) => f.includes('/modules/'));
    const allowedDomains = /(amazonaws|githubusercontent)\.com$/;
    const bad = modules.filter((f) => {
      const text = readFileSync(f, 'utf8');
      const domains = (
        text.match(/[\w.-]+\.(com|io|net|org|app)\b/g) ?? []
      ).filter((d) => !allowedDomains.test(d));
      return (
        domains.length > 0 ||
        /\b\d{12}\b|arn:aws:[a-z0-9-]+:[a-z]{2}-|neonapps/i.test(text)
      );
    });
    expect(bad).toEqual([]);
  });
});
