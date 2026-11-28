/*
 * NOT PART OF THE INTERVIEW.
 * A real `uploadFile` for the `Chat` component. The demo page does not use
 * it: it has no server. `fetch` cannot report how much of a file was sent,
 * so this uses `XMLHttpRequest`, which can.
 */
import type { UploadFile } from "../chat";

/**
 * Makes an upload function that sends the file to `url` with POST. The
 * server must answer with JSON that has the address of the file in `url`.
 */
export function createXhrUpload(url: string): UploadFile {
  return (file, { signal, onProgress }) =>
    new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      const fail = (message: string) => reject(new Error(message));

      // Listeners on `upload` must be set before `send`.
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded / event.total);
        }
      });
      request.addEventListener("error", () => fail("The upload failed."));
      request.addEventListener("abort", () => fail("The upload was cancelled."));
      request.addEventListener("load", () => {
        if (request.status < 200 || request.status >= 300) {
          return fail(`The server answered ${request.status}.`);
        }
        try {
          const body: unknown = JSON.parse(request.responseText);
          const address = (body as { url?: unknown }).url;
          if (typeof address !== "string") {
            return fail("The answer has no address.");
          }
          resolve({ url: address });
        } catch {
          fail("The answer is not JSON.");
        }
      });

      if (signal.aborted) {
        return fail("The upload was cancelled.");
      }
      signal.addEventListener("abort", () => request.abort(), { once: true });

      const form = new FormData();
      form.append("file", file);
      request.open("POST", url);
      request.send(form);
    });
}
