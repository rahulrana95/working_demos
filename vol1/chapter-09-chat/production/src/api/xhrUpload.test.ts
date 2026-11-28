/* NOT PART OF THE INTERVIEW. Tests of the real upload function, with a fake XMLHttpRequest. */
import { createXhrUpload } from "./xhrUpload";

class FakeRequest extends EventTarget {
  static last: FakeRequest;
  upload = new EventTarget();
  status = 0;
  responseText = "";
  opened: string[] = [];
  body: unknown;
  constructor() {
    super();
    FakeRequest.last = this;
  }
  open(method: string, url: string) {
    this.opened = [method, url];
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.dispatchEvent(new Event("abort"));
  }
  /** The server answers. */
  answer(status: number, responseText: string) {
    this.status = status;
    this.responseText = responseText;
    this.dispatchEvent(new Event("load"));
  }
}

const file = new File(["12345"], "cat.png", { type: "image/png" });

function start(signal = new AbortController().signal) {
  const progress: number[] = [];
  const upload = createXhrUpload("/api/upload");
  const result = upload(file, { signal, onProgress: (fraction) => progress.push(fraction) });
  result.catch(() => {});
  return { result, progress, request: FakeRequest.last };
}

describe("createXhrUpload", () => {
  beforeEach(() => vi.stubGlobal("XMLHttpRequest", FakeRequest));
  afterEach(() => vi.unstubAllGlobals());

  it("posts the file as form data", () => {
    const { request } = start();

    expect(request.opened).toEqual(["POST", "/api/upload"]);
    expect((request.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("reports the progress as a number from 0 to 1", () => {
    const { request, progress } = start();

    request.upload.dispatchEvent(
      Object.assign(new Event("progress"), { lengthComputable: true, loaded: 2, total: 5 }),
    );
    request.upload.dispatchEvent(
      Object.assign(new Event("progress"), { lengthComputable: false, loaded: 3, total: 0 }),
    );

    expect(progress).toEqual([0.4]);
  });

  it("resolves with the address in the answer of the server", async () => {
    const { request, result } = start();

    request.answer(201, '{"url":"https://files.example/cat.png"}');

    await expect(result).resolves.toEqual({ url: "https://files.example/cat.png" });
  });

  it.each([
    ["an error status", 500, "{}", "500"],
    ["an answer that is not JSON", 200, "<html>", "not JSON"],
    ["an answer without an address", 200, '{"ok":true}', "no address"],
  ])("rejects for %s", async (_name, status, body, message) => {
    const { request, result } = start();

    request.answer(status, body);

    await expect(result).rejects.toThrow(message);
  });

  it("rejects when the network fails", async () => {
    const { request, result } = start();

    request.dispatchEvent(new Event("error"));

    await expect(result).rejects.toThrow("failed");
  });

  it("stops the request and rejects when the signal is aborted", async () => {
    const controller = new AbortController();
    const { result } = start(controller.signal);

    controller.abort();

    await expect(result).rejects.toThrow("cancelled");
  });

  it("sends nothing when the signal is aborted before the start", async () => {
    const controller = new AbortController();
    controller.abort();
    const { request, result } = start(controller.signal);

    await expect(result).rejects.toThrow("cancelled");
    expect(request.body).toBeUndefined();
  });
});
