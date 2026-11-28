/*
 * NOT PART OF THE INTERVIEW: production version.
 * The hook that joins the pure board to the world outside: the server, the
 * other users, the storage of the browser and the monitoring.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { boardReducer, createBoard } from "./board";
import type { BoardAction, BoardLimits, BoardState } from "./board";
import { eventsFor } from "./events";
import type { BoardEvent } from "./events";
import { PRESENCE_INTERVAL_MS, createThrottle } from "./presence";
import type { Presence } from "./presence";
import type { Point, Scene } from "./scene";
import { saveScene } from "./storage";
import type { Operation } from "./sync";
import { toBoard } from "./view";

/**
 * How the whiteboard talks to the server. The whiteboard cannot see the
 * network, so the caller must keep these rules:
 *   a. `send` and `sendPresence` never throw. A message that cannot be sent
 *      is dropped: set `isOnline` to false instead.
 *   b. `send` may get the same operation again after a reconnect. The server
 *      must ignore an id it has already taken, and still confirm it.
 *   c. The caller passes every operation the server confirms, also this
 *      user's own, to `receiveOperation`, in the order of the sequence
 *      numbers. After a reconnect it starts again after the last number the
 *      board has (`state.sync.lastSeq`).
 */
export interface Transport {
  send: (operation: Operation) => void;
  sendPresence: (presence: Presence) => void;
}

export interface UseWhiteboardOptions {
  userId: string;
  /** Shown next to this user's pointer on the boards of the others. */
  userName: string;
  /** The colour of this user's pointer and selection on the boards of the others. */
  userColour: string;
  transport: Transport;
  /**
   * False while the connection is down. Nothing is sent then. When it turns
   * true again, every operation the server has not confirmed is sent again,
   * with the same id.
   */
  isOnline: boolean;
  /** The scene to start with, and the sequence number it belongs to. Read once. */
  initialScene?: Scene;
  initialSeq?: number;
  limits?: Partial<BoardLimits>;
  /** With a key, the scene is saved in the browser's storage after each change. */
  storageKey?: string;
  /** How long to wait after the last change before the save. */
  saveDelayMs?: number;
  onEvent?: (event: BoardEvent) => void;
}

export interface UseWhiteboardReturn {
  state: BoardState;
  dispatch: (action: BoardAction) => void;
  receiveOperation: (seq: number, operation: Operation) => void;
  receivePresence: (presence: Presence) => void;
  /** Call it when another user disconnects, so their pointer goes away. */
  removePeer: (userId: string) => void;
  /** The whiteboard calls it with the pointer position on the canvas, or null when it leaves. */
  reportCursor: (canvasPoint: Point | null) => void;
  /** The whiteboard calls it after each redraw. One frame a second becomes an event. */
  reportFrame: (drawMs: number, shapesDrawn: number) => void;
}

const FRAME_SAMPLE_MS = 1000;

export function useWhiteboard(options: UseWhiteboardOptions): UseWhiteboardReturn {
  const {
    userId,
    userName,
    userColour,
    transport,
    isOnline,
    storageKey,
    saveDelayMs = 500,
  } = options;

  // createBoard throws when the scene is too large. An error boundary shows that.
  const [state, setState] = useState(() =>
    createBoard({
      userId,
      scene: options.initialScene,
      lastSeq: options.initialSeq,
      limits: options.limits,
    }),
  );

  // The newest values, for callbacks that must not change between renders.
  const stateRef = useRef(state);
  const latest = useRef({ onEvent: options.onEvent, transport, isOnline, userName, userColour });
  useEffect(() => {
    latest.current = { onEvent: options.onEvent, transport, isOnline, userName, userColour };
  }, [options.onEvent, transport, isOnline, userName, userColour]);

  // The reducer runs here, not in useReducer, so that the events of a step
  // can be reported once, with the state before and after it.
  const dispatch = useCallback((action: BoardAction) => {
    const previous = stateRef.current;
    const next = boardReducer(previous, action);
    if (next === previous) {
      return;
    }
    stateRef.current = next;
    setState(next);
    for (const event of eventsFor(previous, next, action)) {
      latest.current.onEvent?.(event);
    }
  }, []);

  // ---- Sending. Each unconfirmed operation goes out once per connection. ----
  const sentIds = useRef(new Set<string>());
  const wasOnline = useRef(isOnline);
  const { unconfirmed } = state.sync;
  useEffect(() => {
    const isReconnect = isOnline && !wasOnline.current;
    wasOnline.current = isOnline;
    if (!isOnline) {
      // What was sent on the old connection may be lost. Forget it, so it is sent again.
      sentIds.current.clear();
      return;
    }
    const toSend = unconfirmed.filter((operation) => !sentIds.current.has(operation.id));
    sentIds.current = new Set(unconfirmed.map((operation) => operation.id));
    toSend.forEach((operation) => transport.send(operation));
    if (isReconnect) {
      latest.current.onEvent?.({ type: "reconnect", resent: toSend.length });
    }
  }, [isOnline, unconfirmed, transport]);

  // ---- Presence: this user's pointer and selection, at most 20 times a second. ----
  const cursorRef = useRef<Point | null>(null);
  const [throttle] = useState(() =>
    createThrottle((presence: Presence) => {
      if (latest.current.isOnline) {
        latest.current.transport.sendPresence(presence);
      }
    }, PRESENCE_INTERVAL_MS),
  );
  const announce = useCallback(() => {
    const { userName: name, userColour: colour } = latest.current;
    const { selectedId } = stateRef.current;
    throttle.call({ userId, name, colour, cursor: cursorRef.current, selectedId });
  }, [throttle, userId]);
  const reportCursor = useCallback(
    (canvasPoint: Point | null) => {
      cursorRef.current = canvasPoint && toBoard(stateRef.current.view, canvasPoint);
      announce();
    },
    [announce],
  );
  useEffect(() => {
    announce();
  }, [announce, state.selectedId, isOnline]);
  useEffect(() => () => throttle.cancel(), [throttle]);

  // ---- Autosave, a moment after the last change. ----
  const { scene } = state.sync;
  const savedScene = useRef(scene);
  useEffect(() => {
    if (storageKey === undefined || scene === savedScene.current) {
      return;
    }
    function saveNow() {
      // A second call for the same scene does nothing.
      if (storageKey !== undefined && scene !== savedScene.current) {
        savedScene.current = scene;
        latest.current.onEvent?.({ type: "save", ...saveScene(storageKey, scene) });
      }
    }
    const timerId = setTimeout(saveNow, saveDelayMs);
    // The user closes the tab or leaves the page before the wait is over: save at once.
    window.addEventListener("pagehide", saveNow);
    return () => {
      clearTimeout(timerId);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [scene, storageKey, saveDelayMs]);

  const lastFrameEventAt = useRef(-Infinity);
  const reportFrame = useCallback((drawMs: number, shapesDrawn: number) => {
    const now = performance.now();
    if (now - lastFrameEventAt.current >= FRAME_SAMPLE_MS) {
      lastFrameEventAt.current = now;
      latest.current.onEvent?.({ type: "frame", drawMs, shapesDrawn });
    }
  }, []);

  const receiveOperation = useCallback(
    (seq: number, operation: Operation) => dispatch({ type: "remote", seq, operation }),
    [dispatch],
  );
  const receivePresence = useCallback(
    // Our own presence may come back from a simple server. It is not a peer.
    (presence: Presence) => presence.userId !== userId && dispatch({ type: "presence", presence }),
    [dispatch, userId],
  );
  const removePeer = useCallback(
    (peerId: string) => dispatch({ type: "peerLeft", userId: peerId }),
    [dispatch],
  );

  return {
    state,
    dispatch,
    receiveOperation,
    receivePresence,
    removePeer,
    reportCursor,
    reportFrame,
  };
}
