# @howells/motif-server

Deprecated compatibility wrapper for `@howells/motif-sdk`.

New code should import from `@howells/motif-sdk` directly:

```ts
import { MotifServer } from "@howells/motif-sdk";
```

This package temporarily re-exports the SDK so older integrations can migrate without changing runtime behavior.
