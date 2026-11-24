# Chapter 4: Typeahead

The user types in a box, and we show matching suggestions from a server.

This chapter has two answers to the same question. Each one is a separate
project, so you can run them side by side and compare the code.

| Folder                     | Level  | What it is                                                                                        |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| [`45-minutes`](45-minutes) | Senior | A typeahead that is correct and fast: debounce, abort, cache, keyboard and screen reader support. |
| [`60-minutes`](60-minutes) | Staff  | The same code, plus what other teams need before they can reuse it.                               |

Start with `45-minutes`. Then compare the two folders to see only the additions:

```bash
git diff --no-index 45-minutes/src 60-minutes/src
```

## What the extra 15 minutes buys

The 45-minute answer works well on one page, for one team. The 60-minute answer
is a component that a form library, a design system or a team in another
country can use without changing its code.

| Addition                                                                                           | Why it matters                                                                                                           | Minutes |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| Controlled value (`value`, `onValueChange`) and form props (`name`, `disabled`, `required`, `ref`) | A form library can own the text, reset it, validate it and focus the input. The value is sent with a normal form submit. | 4       |
| `renderItem`                                                                                       | Each team draws its own row (two lines, an icon, bold text) without a fork of the component.                             | 2       |
| `messages`                                                                                         | Every text the user reads or hears can be translated. No English is fixed in the component.                              | 3       |
| Cache expiry (`cacheTtlMs`) and `maxQueryLength`                                                   | A page that stays open all day does not show old answers. A very long pasted text never reaches the server.              | 3       |
| `className` and logical CSS properties                                                             | The parent can place and style the component. The layout mirrors itself in right-to-left languages.                      | 3       |

Each addition is small on purpose. A staff answer is not more features. It is
the same feature with fewer reasons for another team to copy and change it.
