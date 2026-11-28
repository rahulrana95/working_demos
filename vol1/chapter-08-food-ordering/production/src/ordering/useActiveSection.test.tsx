/* NOT PART OF THE INTERVIEW: production version. */
import { act, render, screen } from "@testing-library/react";
import { useActiveSection } from "./useActiveSection";

/** A fake IntersectionObserver. The test says which sections are in the band. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: Element[] = [];
  isDisconnected = false;

  constructor(
    private callback: (entries: { target: Element; isIntersecting: boolean }[]) => void,
    public options?: IntersectionObserverInit,
  ) {
    FakeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  disconnect() {
    this.isDisconnected = true;
  }

  report(id: string, isIntersecting: boolean) {
    const target = this.observed.find((element) => element.id === id);
    if (target !== undefined) {
      act(() => this.callback([{ target, isIntersecting }]));
    }
  }
}

function Sections({ ids }: { ids: string[] }) {
  const activeId = useActiveSection(ids);
  return (
    <>
      <output>{activeId ?? "none"}</output>
      {ids.map((id) => (
        <section key={id} id={id} />
      ))}
    </>
  );
}

const active = () => screen.getByRole("status").textContent;
const observer = () => FakeObserver.instances[FakeObserver.instances.length - 1];

beforeEach(() => {
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useActiveSection", () => {
  it("starts with the first section", () => {
    render(<Sections ids={["a", "b", "c"]} />);

    expect(active()).toBe("a");
    expect(observer().observed.map((element) => element.id)).toEqual(["a", "b", "c"]);
  });

  it("looks only at a band near the top of the screen", () => {
    render(<Sections ids={["a"]} />);

    expect(observer().options?.rootMargin).toBe("-15% 0px -60% 0px");
  });

  it("marks the section that enters the band", () => {
    render(<Sections ids={["a", "b", "c"]} />);

    observer().report("b", true);

    expect(active()).toBe("b");
  });

  it("marks the first one when two sections are in the band", () => {
    render(<Sections ids={["a", "b", "c"]} />);

    observer().report("c", true);
    observer().report("b", true);

    expect(active()).toBe("b");
  });

  it("keeps the last section while no section is in the band", () => {
    render(<Sections ids={["a", "b", "c"]} />);
    observer().report("b", true);

    observer().report("b", false);

    expect(active()).toBe("b");
  });

  it("goes back to the first section when the marked one leaves the page", () => {
    const { rerender } = render(<Sections ids={["a", "b", "c"]} />);
    observer().report("c", true);

    rerender(<Sections ids={["a", "b"]} />);

    expect(active()).toBe("a");
  });

  it("makes a new observer only when the ids change, and stops the old one", () => {
    const { rerender, unmount } = render(<Sections ids={["a", "b"]} />);

    rerender(<Sections ids={["a", "b"]} />);
    expect(FakeObserver.instances).toHaveLength(1);

    rerender(<Sections ids={["a"]} />);
    expect(FakeObserver.instances).toHaveLength(2);
    expect(FakeObserver.instances[0].isDisconnected).toBe(true);

    unmount();
    expect(FakeObserver.instances[1].isDisconnected).toBe(true);
  });

  it("gives no section for an empty page", () => {
    render(<Sections ids={[]} />);

    expect(active()).toBe("none");
  });

  it("works in a browser without IntersectionObserver: the first section stays marked", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(<Sections ids={["a", "b"]} />);

    expect(active()).toBe("a");
  });
});
