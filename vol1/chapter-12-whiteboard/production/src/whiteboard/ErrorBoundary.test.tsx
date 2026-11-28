/* NOT PART OF THE INTERVIEW. Tests for the error boundary. */
import { fireEvent, render, screen } from "@testing-library/react";
import { WhiteboardErrorBoundary } from "./ErrorBoundary";
import { SceneTooLargeError } from "./board";

let shouldThrow: Error | null;

function Child() {
  if (shouldThrow !== null) {
    throw shouldThrow;
  }
  return <p>The board</p>;
}

describe("WhiteboardErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = null;
    // React writes every caught error to the console. That is expected here.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows its children when nothing is wrong", () => {
    render(
      <WhiteboardErrorBoundary>
        <Child />
      </WhiteboardErrorBoundary>,
    );

    expect(screen.getByText("The board")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a message in place of a child that throws, and reports the error", () => {
    shouldThrow = new Error("boom");
    const onError = vi.fn();

    render(
      <WhiteboardErrorBoundary onError={onError}>
        <Child />
      </WhiteboardErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The whiteboard stopped working.");
    expect(onError).toHaveBeenCalledWith(shouldThrow, expect.anything());
  });

  it("says that the board is too large when that is the reason", () => {
    shouldThrow = new SceneTooLargeError(25_000, 20_000);

    render(
      <WhiteboardErrorBoundary>
        <Child />
      </WhiteboardErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This board has too many shapes to open here.",
    );
  });

  it("builds the children again when the user presses the button", () => {
    shouldThrow = new Error("boom");
    render(
      <WhiteboardErrorBoundary>
        <Child />
      </WhiteboardErrorBoundary>,
    );

    shouldThrow = null;
    fireEvent.click(screen.getByRole("button", { name: "Start the whiteboard again" }));

    expect(screen.getByText("The board")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the message again when the child still throws after a restart", () => {
    shouldThrow = new Error("boom");
    render(
      <WhiteboardErrorBoundary>
        <Child />
      </WhiteboardErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start the whiteboard again" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("uses the texts it is given", () => {
    shouldThrow = new Error("boom");

    render(
      <WhiteboardErrorBoundary
        messages={{ failed: "व्हाइटबोर्ड रुक गया।", reload: "फिर से शुरू करें" }}
      >
        <Child />
      </WhiteboardErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("व्हाइटबोर्ड रुक गया।");
    expect(screen.getByRole("button", { name: "फिर से शुरू करें" })).toBeInTheDocument();
  });
});
