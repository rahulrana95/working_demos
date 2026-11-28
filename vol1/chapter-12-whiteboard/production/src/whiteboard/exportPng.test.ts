/* NOT PART OF THE INTERVIEW. Tests for saving the canvas as a picture. jsdom has no real canvas. */
import { exportPng } from "./exportPng";

describe("exportPng", () => {
  let page: {
    fillStyle: string;
    fillRect: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
  };
  let blob: Blob | null;
  let clickedLinks: HTMLAnchorElement[];

  beforeEach(() => {
    page = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    blob = new Blob(["png"], { type: "image/png" });
    clickedLinks = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      // Only the calls that exportPng makes are needed here.
      page as unknown as CanvasRenderingContext2D,
    );
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(blob);
    };
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedLinks.push(this);
    });
    URL.createObjectURL = vi.fn(() => "blob:picture");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts a white page under the drawing, because the canvas is see-through", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 200;

    await exportPng(canvas);

    expect(page.fillStyle).toBe("#ffffff");
    expect(page.fillRect).toHaveBeenCalledWith(0, 0, 300, 200);
    expect(page.drawImage).toHaveBeenCalledWith(canvas, 0, 0);
    expect(page.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      page.drawImage.mock.invocationCallOrder[0],
    );
  });

  it("gives the browser a file with the given name, and then frees the address", async () => {
    const wasSaved = await exportPng(document.createElement("canvas"), "plan.png");

    expect(wasSaved).toBe(true);
    expect(clickedLinks).toHaveLength(1);
    expect(clickedLinks[0].download).toBe("plan.png");
    expect(clickedLinks[0].href).toBe("blob:picture");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picture");
  });

  it("resolves with false when the browser cannot make the picture", async () => {
    blob = null;

    expect(await exportPng(document.createElement("canvas"))).toBe(false);
    expect(clickedLinks).toEqual([]);
  });
});
