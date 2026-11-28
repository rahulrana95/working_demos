/*
 * NOT PART OF THE INTERVIEW: production version.
 * The like queue, tested with no React. The test answers each request by hand.
 */
import { LikeQueue, MAX_TRIES } from "./likeQueue";
import type { LikeIntent } from "./likeQueue";
import { createDeferred } from "./testHelpers";
import type { Deferred } from "./testHelpers";
import { LikeRejectedError } from "./types";
import type { LikeState } from "./types";

function createQueue() {
  const sent: { intent: LikeIntent; answer: Deferred<LikeState> }[] = [];
  const onSettled = vi.fn();
  const onPausedChange = vi.fn();
  const queue = new LikeQueue(
    (intent) => {
      const answer = createDeferred<LikeState>();
      sent.push({ intent: { ...intent }, answer });
      return answer.promise;
    },
    { onSettled, onPausedChange },
  );
  return { queue, sent, onSettled, onPausedChange };
}

/** Lets the queue run the code that waits for a promise. */
async function tick(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) {
    await Promise.resolve();
  }
}

const LIKED = { likeCount: 6, likedByMe: true };
const NOT_LIKED = { likeCount: 5, likedByMe: false };

describe("LikeQueue: sending", () => {
  it("sends the first choice at once", () => {
    const { queue, sent } = createQueue();

    queue.add("p1", true);

    expect(sent).toHaveLength(1);
    expect(sent[0].intent).toMatchObject({ postId: "p1", liked: true, tries: 1 });
  });

  it("sends one request at a time, in the order of the taps", async () => {
    const { queue, sent } = createQueue();

    queue.add("p1", true);
    queue.add("p2", true);
    queue.add("p3", true);
    expect(sent).toHaveLength(1);

    sent[0].answer.resolve(LIKED);
    await tick();
    sent[1].answer.resolve(LIKED);
    await tick();

    expect(sent.map(({ intent }) => intent.postId)).toEqual(["p1", "p2", "p3"]);
  });

  it("sends two requests at most for ten fast taps on one post", async () => {
    const { queue, sent } = createQueue();

    for (let tap = 1; tap <= 10; tap++) {
      queue.add("p1", tap % 2 === 1);
    }
    sent[0].answer.resolve(LIKED);
    await tick();
    sent[1].answer.resolve(NOT_LIKED);
    await tick();

    expect(sent.map(({ intent }) => intent.liked)).toEqual([true, false]);
  });

  it("says that an answer is not the latest when a newer choice for the post waits", async () => {
    const { queue, sent, onSettled } = createQueue();
    queue.add("p1", true);
    queue.add("p1", false);

    sent[0].answer.resolve(LIKED);
    await tick();
    expect(onSettled).toHaveBeenLastCalledWith(
      expect.objectContaining({ liked: true }),
      LIKED,
      false,
    );

    sent[1].answer.resolve(NOT_LIKED);
    await tick();
    expect(onSettled).toHaveBeenLastCalledWith(
      expect.objectContaining({ liked: false }),
      NOT_LIKED,
      true,
    );
  });

  it("sends nothing more and reports nothing after it was stopped", async () => {
    const { queue, sent, onSettled, onPausedChange } = createQueue();
    queue.add("p1", true);
    queue.add("p2", true);

    queue.stop();
    sent[0].answer.reject(new Error("aborted"));
    await tick();

    expect(sent).toHaveLength(1);
    expect(onSettled).not.toHaveBeenCalled();
    expect(onPausedChange).not.toHaveBeenCalled();
  });
});

describe("LikeQueue: when the network fails", () => {
  it("keeps the choice and stops, with no second request by itself", async () => {
    const { queue, sent, onSettled, onPausedChange } = createQueue();
    queue.add("p1", true);
    queue.add("p2", true);

    sent[0].answer.reject(new Error("no network"));
    await tick();

    expect(sent).toHaveLength(1);
    expect(onSettled).not.toHaveBeenCalled();
    expect(onPausedChange).toHaveBeenLastCalledWith(true);
  });

  it("sends the kept choice first, with the same key, when it is told to go on", async () => {
    const { queue, sent, onSettled, onPausedChange } = createQueue();
    queue.add("p1", true);
    queue.add("p2", true);
    sent[0].answer.reject(new Error("no network"));
    await tick();

    queue.resume();

    expect(onPausedChange).toHaveBeenLastCalledWith(false);
    expect(sent[1].intent).toMatchObject({ postId: "p1", liked: true, tries: 2 });
    expect(sent[1].intent.idempotencyKey).toBe(sent[0].intent.idempotencyKey);

    sent[1].answer.resolve(LIKED);
    await tick();
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ postId: "p1" }), LIKED, true);
    expect(sent[2].intent.postId).toBe("p2");
  });

  it("takes a like that the user makes while it is stopped, and tries the network again", async () => {
    const { queue, sent } = createQueue();
    queue.add("p1", true);
    sent[0].answer.reject(new Error("no network"));
    await tick();

    queue.add("p2", true);

    // The kept like for p1 goes first.
    expect(sent[1].intent.postId).toBe("p1");
  });

  it("drops the kept choice when the user chose again for that post", async () => {
    const { queue, sent, onSettled } = createQueue();
    queue.add("p1", true);
    queue.add("p1", false);
    sent[0].answer.reject(new Error("no network"));
    await tick();

    queue.resume();

    // Only the unlike is sent. The like that failed is not sent again.
    expect(sent[1].intent.liked).toBe(false);
    sent[1].answer.resolve(NOT_LIKED);
    await tick();
    expect(sent).toHaveLength(2);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("does nothing on resume when nothing waits", () => {
    const { queue, sent, onPausedChange } = createQueue();

    queue.resume();

    expect(sent).toHaveLength(0);
    expect(onPausedChange).not.toHaveBeenCalled();
  });

  it(`gives up after ${MAX_TRIES} tries, so a choice is never sent for ever`, async () => {
    const { queue, sent, onSettled } = createQueue();
    queue.add("p1", true);

    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      sent[attempt].answer.reject(new Error("server error"));
      await tick();
      queue.resume();
    }
    await tick();

    expect(sent).toHaveLength(MAX_TRIES);
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ postId: "p1" }), null, true);
  });
});

describe("LikeQueue: when the server refuses a like", () => {
  it("settles it as failed at once and does not send it again", async () => {
    const { queue, sent, onSettled, onPausedChange } = createQueue();
    queue.add("p1", true);

    sent[0].answer.reject(new LikeRejectedError());
    await tick();
    queue.resume();

    expect(sent).toHaveLength(1);
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ postId: "p1" }), null, true);
    expect(onPausedChange).not.toHaveBeenCalled();
  });

  it("goes on with the next choice", async () => {
    const { queue, sent } = createQueue();
    queue.add("p1", true);
    queue.add("p2", true);

    sent[0].answer.reject(new LikeRejectedError());
    await tick();

    expect(sent[1].intent.postId).toBe("p2");
  });
});
