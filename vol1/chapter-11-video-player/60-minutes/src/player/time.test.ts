/* NOT PART OF THE INTERVIEW. */
import { formatTime, spokenTime } from "./time";

describe("formatTime", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [80, "1:20"],
    [80.9, "1:20"],
    [600, "10:00"],
    [3723, "1:02:03"],
    [36000, "10:00:00"],
  ])("shows %d seconds as %s", (seconds, text) => {
    expect(formatTime(seconds)).toBe(text);
  });

  it("shows 0:00 for a time that is not a number yet, or is below zero", () => {
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
    expect(formatTime(-3)).toBe("0:00");
  });
});

describe("spokenTime", () => {
  it.each([
    [0, "0 seconds"],
    [1, "1 second"],
    [20, "20 seconds"],
    [60, "1 minute"],
    [80, "1 minute 20 seconds"],
    [300, "5 minutes"],
    [3600, "1 hour"],
    [3723, "1 hour 2 minutes 3 seconds"],
    [7200, "2 hours"],
  ])("reads %d seconds as %s in English", (seconds, text) => {
    expect(spokenTime(seconds, "en")).toBe(text);
  });

  it("reads the time in the words of another language, here Hindi", () => {
    expect(spokenTime(80, "hi")).toBe("1 मिनट 20 सेकंड");
    expect(spokenTime(3600, "hi")).toBe("1 घंटा");
    expect(spokenTime(7200, "hi")).toBe("2 घंटे");
  });

  it("uses the plural forms of the language: Russian has three", () => {
    expect(spokenTime(1, "ru")).toBe("1 секунда");
    expect(spokenTime(2, "ru")).toBe("2 секунды");
    expect(spokenTime(5, "ru")).toBe("5 секунд");
  });

  it("reads 0 seconds for a time that is not a number yet", () => {
    expect(spokenTime(NaN, "en")).toBe("0 seconds");
  });
});
