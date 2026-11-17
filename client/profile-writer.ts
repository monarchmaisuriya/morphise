type ReadResult<Values> = { status: "ready"; revision: string; values: Values } | { status: "invalid"; error: string };
type WriteResult = { status: "saved" } | { status: "conflict" } | { status: "invalid"; error: string };

// The profile's settings reads and writes, as the writer needs them.
export interface ProfileCalls<Values> {
  read(): Promise<ReadResult<Values>>;
  write(input: { revision: string; values: Values }): Promise<WriteResult>;
}

// Applies a change to the saved profile and writes it against the revision it read. When another
// app saved first, it reads the newer profile and applies the change again, up to `attempts` times
// in all, so both saves survive. A change that returns null has nothing to write.
// `what` names the document in its errors.
export async function changeSavedProfile<Values>(calls: ProfileCalls<Values>, change: (values: Values) => Values | null, attempts: number, what = "profile"): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const state = await calls.read();
    if (state.status !== "ready") throw new Error(`The saved ${what} is invalid: ${state.error}`);
    const values = change(state.values);
    if (values === null) return;
    const result = await calls.write({ revision: state.revision, values });
    if (result.status === "saved") return;
    if (result.status === "invalid") throw new Error(result.error);
  }
  throw new Error(`Another app saved the ${what} at the same moment; try again`);
}
