/*
 * NOT PART OF THE INTERVIEW: production version.
 * Saves what the canvas shows as a PNG file. It saves the view, not the whole
 * board: shapes outside the view are not in the picture.
 */

/** Resolves with true when the browser was given the file, and false when it could not make one. */
export function exportPng(
  canvas: HTMLCanvasElement,
  fileName = "whiteboard.png",
): Promise<boolean> {
  // The canvas is see-through where nothing is drawn. A picture needs a white page under it.
  const page = document.createElement("canvas");
  page.width = canvas.width;
  page.height = canvas.height;
  const context = page.getContext("2d");
  if (context === null) {
    return Promise.resolve(false);
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, page.width, page.height);
  context.drawImage(canvas, 0, 0);

  return new Promise((resolve) => {
    page.toBlob((blob) => {
      if (blob === null) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      // The download has started. The address is not needed any more.
      URL.revokeObjectURL(url);
      resolve(true);
    }, "image/png");
  });
}
