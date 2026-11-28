/* NOT PART OF THE INTERVIEW. Helpers that the tests share. */
import { act } from "@testing-library/react";

/** Moves the fake clock forward and lets React finish its updates. */
export async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Lets queued media events and promises run, without moving the clock. */
export async function flush(): Promise<void> {
  await wait(0);
}
