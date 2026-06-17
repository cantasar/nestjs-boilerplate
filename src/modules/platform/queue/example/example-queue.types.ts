/** Named job type within the example queue. */
export const EXAMPLE_JOB = 'example-job';

/** Payload shape carried by an example queue job. */
export interface ExampleJob {
  message: string;
}
