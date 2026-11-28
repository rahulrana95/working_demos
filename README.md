# Working demos

Working code for the book **Master System Design for Frontend Engineers**.

Every piece of code printed in the book lives here, with tests.

## Volume 1

Chapters 1 to 3 of the book explain the approach and have no code.

| Chapter | Interview                           | Folder                                                           |
| ------- | ----------------------------------- | ---------------------------------------------------------------- |
| 4       | Typeahead                           | [`vol1/chapter-04-typeahead`](vol1/chapter-04-typeahead)         |
| 5       | Generic form component              | [`vol1/chapter-05-generic-form`](vol1/chapter-05-generic-form)   |
| 6       | News feed                           | [`vol1/chapter-06-news-feed`](vol1/chapter-06-news-feed)         |
| 7       | Analytics SDK                       | [`vol1/chapter-07-analytics-sdk`](vol1/chapter-07-analytics-sdk) |
| 8       | Food ordering and live order status | [`vol1/chapter-08-food-ordering`](vol1/chapter-08-food-ordering) |
| 9       | Chat                                | [`vol1/chapter-09-chat`](vol1/chapter-09-chat)                   |
| 10      | Calendar                            | [`vol1/chapter-10-calendar`](vol1/chapter-10-calendar)           |
| 11      | Video player                        | [`vol1/chapter-11-video-player`](vol1/chapter-11-video-player)   |
| 12      | Whiteboard with undo and redo       | [`vol1/chapter-12-whiteboard`](vol1/chapter-12-whiteboard)       |
| 13      | Collaborative document editor       | [`vol1/chapter-13-collab-editor`](vol1/chapter-13-collab-editor) |

## Three versions of every answer

Each chapter folder holds three separate projects. You can run one without installing the others.

| Folder       | What it is                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `45-minutes` | The senior answer. Small enough to type in a 45-minute coding round.                                     |
| `60-minutes` | The staff answer. The same, plus what a staff candidate adds in 15 more minutes.                         |
| `production` | Not an interview answer. What a team adds in the first week: failure handling, monitoring and hardening. |

Every source file says on its first lines whether you would write it in an interview. Each chapter's own
README says what each version adds and what is described in the book but not built.

## Run any version

```bash
cd vol1/chapter-04-typeahead/45-minutes
```

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev
```

You need Node.js 20 or newer.
