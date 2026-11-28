/*
 * NOT PART OF THE INTERVIEW.
 * Draws the picture of the simulated video. There is no video file, so we
 * draw a small canvas for the current time and show it as the poster of the
 * <video> element. A <video> with no data shows its poster.
 */

const WIDTH = 480;
const HEIGHT = 270;
const REDRAW_MS = 250;

/** Starts drawing. Returns a function that stops it. */
export function startPicture(video: HTMLVideoElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) {
    return () => undefined;
  }

  let lastDrawnTime = -1;

  function draw(pen: CanvasRenderingContext2D) {
    const time = video.currentTime;
    if (time === lastDrawnTime) {
      return;
    }
    lastDrawnTime = time;

    // The colour moves slowly with the time, so you can see the video move.
    pen.fillStyle = `hsl(${(time * 6) % 360} 45% 22%)`;
    pen.fillRect(0, 0, WIDTH, HEIGHT);

    // A ball that crosses the picture once every 10 seconds.
    pen.fillStyle = "#ffd166";
    pen.beginPath();
    pen.arc(((time % 10) / 10) * WIDTH, HEIGHT / 2, 18, 0, Math.PI * 2);
    pen.fill();

    pen.fillStyle = "#ffffff";
    pen.font = "20px system-ui, sans-serif";
    pen.textAlign = "center";
    pen.fillText(`Simulated video: second ${time.toFixed(1)}`, WIDTH / 2, 48);

    video.poster = canvas.toDataURL("image/png");
  }

  draw(context);
  const timerId = setInterval(() => draw(context), REDRAW_MS);
  return () => clearInterval(timerId);
}
