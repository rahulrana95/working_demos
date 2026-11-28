/*
 * NOT PART OF THE INTERVIEW.
 * Tests for the rules that keep every user's board the same. A tiny server
 * in the test gives the operations their order.
 */
import type { Command } from "./commands";
import type { Scene, Shape } from "./scene";
import { addLocal, createSync, receive } from "./sync";
import type { Operation, SyncState } from "./sync";

function rect(id: string, x = 0, stroke = "black"): Shape {
  return { id, kind: "rect", x, y: 0, width: 10, height: 10, stroke };
}

const oneRect: Scene = { shapesById: { s: rect("s") }, order: ["s"] };

function operation(id: string, command: Command): Operation {
  return { id, userId: id.split("-")[0], command };
}

function take(sync: SyncState, seq: number, incoming: Operation): SyncState {
  return receive(sync, seq, incoming).sync;
}

describe("a user's own operation", () => {
  it("shows at once, before the server has seen it", () => {
    const sync = addLocal(
      createSync(oneRect),
      operation("a-1", { type: "move", id: "s", dx: 5, dy: 0 }),
    );

    expect(sync.scene.shapesById.s.x).toBe(5);
    expect(sync.confirmed.shapesById.s.x).toBe(0);
    expect(sync.unconfirmed).toHaveLength(1);
  });

  it("stops waiting when it comes back from the server, and is not applied a second time", () => {
    const own = operation("a-1", { type: "move", id: "s", dx: 5, dy: 0 });

    const sync = take(addLocal(createSync(oneRect), own), 1, own);

    expect(sync.unconfirmed).toEqual([]);
    expect(sync.scene.shapesById.s.x).toBe(5);
    expect(sync.confirmed).toEqual(sync.scene);
    expect(sync.lastSeq).toBe(1);
  });
});

describe("an operation of someone else", () => {
  it("goes under our waiting operations, which are applied again on top", () => {
    const own = operation("a-1", { type: "restyle", id: "s", patch: { stroke: "red" } });
    const theirs = operation("b-1", { type: "restyle", id: "s", patch: { stroke: "blue" } });
    const before = addLocal(createSync(oneRect), own);

    // The server put their operation first. Ours is later, so ours wins.
    const after = take(before, 1, theirs);

    expect(after.confirmed.shapesById.s.stroke).toBe("blue");
    expect(after.scene.shapesById.s.stroke).toBe("red");
    expect(take(after, 2, own).scene.shapesById.s.stroke).toBe("red");
  });

  it("is reported as a conflict when it changes a shape that we are changing too", () => {
    const own = operation("a-1", { type: "move", id: "s", dx: 5, dy: 0 });
    const before = addLocal(createSync(oneRect), own);

    const sameShape = operation("b-1", { type: "move", id: "s", dx: 1, dy: 1 });
    const otherShape = operation("b-2", { type: "add", shape: rect("t"), index: 1 });

    expect(receive(before, 1, sameShape).isConflict).toBe(true);
    expect(receive(before, 1, otherShape).isConflict).toBe(false);
    expect(receive(before, 1, own).isConflict).toBe(false);
    expect(receive(createSync(oneRect), 1, sameShape).isConflict).toBe(false);
  });

  it("makes our waiting operation do nothing when it removed the shape", () => {
    const own = operation("a-1", { type: "move", id: "s", dx: 5, dy: 0 });
    const removed = operation("b-1", { type: "remove", id: "s" });

    const sync = take(take(addLocal(createSync(oneRect), own), 1, removed), 2, own);

    expect(sync.scene).toEqual({ shapesById: {}, order: [] });
  });
});

describe("a transport that fails at its job", () => {
  const theirs = operation("b-1", { type: "move", id: "s", dx: 5, dy: 0 });

  it("an operation that arrives twice is applied once", () => {
    const once = take(createSync(oneRect), 1, theirs);

    const twice = take(once, 1, theirs);

    expect(twice).toBe(once);
    expect(twice.scene.shapesById.s.x).toBe(5);
  });

  it("an operation that skips a number is ignored until the missing one came", () => {
    const start = createSync(oneRect);

    const skipped = take(start, 2, theirs);

    expect(skipped).toBe(start);
  });

  it("starts after the sequence number that the scene came with", () => {
    const start = createSync(oneRect, 40);

    expect(take(start, 40, theirs)).toBe(start);
    expect(take(start, 41, theirs).lastSeq).toBe(41);
  });
});

/** A small random number generator with a seed, so every run tests the same cases. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("every user ends with the same scene", () => {
  it("two values of one shape changed by two users at the same time: both changes stay", () => {
    const fromA = operation("a-1", { type: "restyle", id: "s", patch: { stroke: "red" } });
    const fromB = operation("b-1", { type: "resize", id: "s", patch: { width: 80 } });
    let a = addLocal(createSync(oneRect), fromA);
    let b = addLocal(createSync(oneRect), fromB);

    for (const [seq, incoming] of [fromB, fromA].entries()) {
      a = take(a, seq + 1, incoming);
      b = take(b, seq + 1, incoming);
    }

    expect(a.scene.shapesById.s).toMatchObject({ stroke: "red", width: 80 });
    expect(b.scene).toEqual(a.scene);
  });

  it("the same value changed by two users: the one the server numbered later wins, for both", () => {
    const fromA = operation("a-1", { type: "restyle", id: "s", patch: { stroke: "red" } });
    const fromB = operation("b-1", { type: "restyle", id: "s", patch: { stroke: "blue" } });
    let a = addLocal(createSync(oneRect), fromA);
    let b = addLocal(createSync(oneRect), fromB);

    for (const [seq, incoming] of [fromA, fromB].entries()) {
      a = take(a, seq + 1, incoming);
      b = take(b, seq + 1, incoming);
    }

    expect(a.scene.shapesById.s.stroke).toBe("blue");
    expect(b.scene.shapesById.s.stroke).toBe("blue");
  });

  it("two users move the same shape at the same time: both moves stay", () => {
    const fromA = operation("a-1", { type: "move", id: "s", dx: 100, dy: 0 });
    const fromB = operation("b-1", { type: "move", id: "s", dx: 0, dy: 50 });
    let a = addLocal(createSync(oneRect), fromA);
    let b = addLocal(createSync(oneRect), fromB);

    for (const [seq, incoming] of [fromB, fromA].entries()) {
      a = take(a, seq + 1, incoming);
      b = take(b, seq + 1, incoming);
    }

    expect(a.scene.shapesById.s).toMatchObject({ x: 100, y: 50 });
    expect(b.scene).toEqual(a.scene);
  });

  it("three users, 300 random operations, random delays: all three scenes are equal", () => {
    const random = createRandom(42);
    const users = ["a", "b", "c"];
    const clients = users.map(() => createSync(oneRect));
    /** What each user has sent but the server has not taken yet. */
    const onTheWay: Operation[][] = users.map(() => []);
    /** How many entries of the log each user has received. */
    const received = users.map(() => 0);
    const log: Operation[] = [];
    let nextId = 1;

    function randomCommand(scene: Scene): Command {
      const ids = scene.order;
      const id = ids[Math.floor(random() * ids.length)] ?? "s";
      const pick = random();
      if (pick < 0.25) {
        const shape = rect(`new-${nextId}`, Math.floor(random() * 500));
        return { type: "add", shape, index: Math.floor(random() * (ids.length + 1)) };
      }
      if (pick < 0.4) {
        return { type: "remove", id };
      }
      if (pick < 0.7) {
        return { type: "move", id, dx: Math.floor(random() * 20) - 10, dy: 0 };
      }
      const stroke = ["red", "blue", "black"][Math.floor(random() * 3)];
      return { type: "restyle", id, patch: { stroke } };
    }

    for (let round = 0; round < 3000; round++) {
      const user = Math.floor(random() * users.length);
      const step = random();
      if (step < 0.34 && nextId <= 300) {
        // The user does something on what they see right now.
        const own = operation(`${users[user]}-${nextId++}`, randomCommand(clients[user].scene));
        clients[user] = addLocal(clients[user], own);
        onTheWay[user].push(own);
      } else if (step < 0.67 && onTheWay[user].length > 0) {
        // The server takes the user's oldest operation and gives it the next number.
        log.push(onTheWay[user].shift() as Operation);
      } else if (received[user] < log.length) {
        // The user receives the next operation of the log.
        clients[user] = take(clients[user], received[user] + 1, log[received[user]]);
        received[user] += 1;
      }
    }
    // The network goes quiet: everything arrives.
    users.forEach((_user, user) => log.push(...onTheWay[user]));
    users.forEach((_user, user) => {
      while (received[user] < log.length) {
        clients[user] = take(clients[user], received[user] + 1, log[received[user]]);
        received[user] += 1;
      }
    });

    expect(log.length).toBe(300);
    expect(clients[0].unconfirmed).toEqual([]);
    expect(clients[1].scene).toEqual(clients[0].scene);
    expect(clients[2].scene).toEqual(clients[0].scene);
    expect(clients[0].scene).toEqual(clients[0].confirmed);
  });
});
