// Voice dictation on the overlay's Instructions box (Andrew, /goal 2026-08-07:
// "Anytime we have any sort of input, we should be able to have voice").
//
// This needs a real browser because the mechanism under test spans the shadow
// root, the delegated panel listeners, and renderPanel()'s wholesale DOM
// rebuild — the defect class is a transcript that lands in the textarea NODE
// but never in the module-level draft, which reads perfectly until the next
// background render throws it away. No fake-DOM shim reproduces that rebuild.
//
// The recognizer itself is faked: headless Chromium ships the
// webkitSpeechRecognition constructor but no speech service, so a live
// SpeechRecognition can never produce a result in CI. The fixture installs
// window.SpeechRecognition BEFORE the bridge injects the overlay (fixture
// scripts run first — the overlay tag is appended before </body>), and the
// overlay's feature detection reads SpeechRecognition ahead of the webkit
// prefix, so the fake wins deterministically.
//
// Round 2 (Andrew, 2026-08-07: "voice would be way better if it live streamed
// it into the box, or had a proper voice attention system with soundwaves"):
// interimResults=true streaming with strip-and-reinject (each event's interim
// snapshot REPLACES the last; dictation.injected tracks the EXACT appended
// chunk, separator and clamp included; a field that no longer ends with the
// injection means the user edited mid-dictation and their text wins), plus a
// [data-voice-wave] canvas beside the active mic driven by a real
// getUserMedia -> AnalyserNode -> rAF loop (fail-soft: SpeechRecognition
// captures its own audio, so a denied wave never costs the dictation). The
// fake's default interimResults is FALSE so the overlay's own assignment is
// what the config assertion measures — a fake defaulting true could never
// fail it. The wave-teardown tests override navigator.mediaDevices via
// defineProperty (it is an accessor with no setter) and hold grants in a
// pending[] queue, because the late-grant race is unreachable with an
// auto-resolving fake.
//
// The round-2 adverse pass (Kimi K3: F1–F7; Sol GPT-5.6: #1–#4, verdict DOES
// NOT SURVIVE) drove a fix round, and every fix below has its own test and
// its own mutant — with ONE stated exception, Kimi F5, at the end of this
// paragraph: the hidden-surface teardown hooks (closeSettingsModal +
// setPanelCollapsed -> stopDictationIfFieldInside — hiding is not gone, and
// the vanished-field guard can never see a hide), the stopping-flag stop
// protocol (real Chrome's stop() flushes one last final BEFORE onend; a
// nulled session dropped it at the identity guard, so a short utterance
// vanished entirely — the fake's synchronous stop()->onend cannot deliver
// that ordering, which is why the flush test replays it by hand), onresult's
// load-bearing field pre-check (an interim pending against a removed field
// used to TypeError out of the handler with no stop path), the all-results
// interim rebuild (resultIndex above an unchanged interim must not delete
// it), the shared surrogate-aware clampDictatedValue, recognizer.lang from
// the USER'S locale (not the host page's), and the suspended-AudioContext
// resume. Sol #3 is dispositioned by NARROWING the claim, not by code: the
// suffix check never eats user text THAT DIFFERS from the injected chunk;
// a byte-identical retype and a deleted-then-finalized interim both leave
// extra DICTATED text (the resurrect case is PINNED as intended semantics —
// deletion does not unsay speech; a red on that pin is a semantics CHANGE,
// re-read the disposition before "fixing" it). dismiss() stops any live
// dictation EAGERLY (first thing after the drag teardown, before it clears
// the panel contents — a recognizer left running would keep the mic hot
// against fields that no longer exist until the next speech event happened
// to notice). Kimi F5 (escape the label interpolation) is fixed in
// code but review-verified only — every call-site label is a literal safe
// string, so no mutant can redden a test for it; stated here rather than
// pretended.
//
// Mutation matrix v12 — every radius below is MEASURED (57 mutants, each a
// string edit on a copy served through RAVEN_GRAB_ASSET_PATH, load-checked
// before its run so a parse failure cannot masquerade as a detection; ✖
// names deduped because node --test repeats them in its summary). The matrix
// re-ran WHOLE for the Sol round-11 fix round: the plane-14 alternation's
// LEAD surrogate is now a RANGE — the U+E0000-E0FFF block spans FOUR lead
// surrogates (0xDB40..0xDB43), and v11 shipped it as the single lead
// 0xDB40, which covers only U+E0000-E03FF, the block's first QUARTER (Sol
// round-11 P2): a U+E0400-only final walked through the append gate, wrote
// invisible junk AND marked the parked entry — the same loss path, three
// quarters of a plane over — while every BMP fixture stayed green. The fix
// STALED R5k's find-string (R5k anchors the predicate's return line, which
// is exactly the line the fix rewrote): the anchor was migrated to the v12
// line before the run, caught by the EXTERNAL pre-run anchor scan — and Sol
// round-12 then falsified the abort this header used to promise: the
// harness itself checked anchors inside the mutation loop and `continue`d
// on a miss, so a stale anchor printed "not applied" and the run still
// reached matrix-exit:0 — fail-open, with the guarantee living in a human
// reading the log. The harness now runs a fail-closed anchor preflight
// (every find-string must match exactly once BEFORE the baseline, one miss
// exits nonzero), negative-tested with a deliberately broken anchor
// (exit 1, no browser launched), and a syntax-failing mutant aborts the
// run instead of being skipped; the whole matrix re-ran under the fixed
// harness (run12b.out) with every radius unchanged from run12. Sol
// round-13 then found the same fail-open class one layer down (plus this
// header's own raw-output pointer still naming run12): the grading read
// ONLY the parsed ✖ lines, never the runner's summary, so a timed-out or
// crashed node --test parsed as zero ✖ and was reported "0 red — SURVIVED"
// with matrix-exit:0 — a false survivor manufactured by the harness — and
// nothing proved a mutant copy actually differed from the pristine overlay
// (a replace equal to its find would run UNMUTATED and report a survivor
// about nothing). Both fail-closed now: every run must parse a full summary
// accounting for exactly 40 tests — zero skips, zero cancels, pass+fail
// totalling, distinct ✖ names matching the fail count, exit status
// agreeing — or the matrix aborts; and a no-op replace dies in the
// preflight. Each proven by its own doctored-copy negative test (a
// 50ms-timeout copy and a replace===find copy both exit 1), and the matrix
// re-ran WHOLE under the fixed harness (run12c.out), radii unchanged again.
// Sol round-14 then broke the no-op check itself: it compared find and
// replace as STRINGS while the mutation used String.replace's two-arg form,
// which gives the replacement $-pattern semantics — a replace of '$&'
// differs from its find yet expands to the match and reproduces the
// pristine overlay, the same false survivor one layer down. The mutation is
// literal now (a function replacer inside one applyMutation shared by the
// preflight and the run loop — two copies of one rule is how they drift),
// and the preflight rejects any mutation whose CONSTRUCTED output equals
// the original, so the guard is on the effect, never a string proxy. All 57
// declared mutations were measured byte-identical under both semantics
// (so the switch could move no radius) and every negative copy re-proven:
// replace===find and a string-semantics '$&' copy both die in the
// preflight, the 50ms-timeout copy still dies at baseline. Matrix re-ran
// WHOLE under the round-15 harness (run12d.out), radii unchanged again.
// v12 ADDS R5l, which narrows the
// lead range back to the single 0xDB40 (the v11 form), and test 39's
// fixture widened to carry U+E0400 (the surrogate pair DB41 DC00) so R5l
// has something to redden. Run12 measured R5l = exactly the invisible-only
// test, R5k unchanged at invisible-only + zero-width-clamp, and every
// other radius UNCHANGED from v11. The v11 round's story: the matrix
// re-ran WHOLE for the Sol round-10 fix round: dictatedVisibleContent's
// class widened from the round-9 ES5 approximation to the COMPLETE Unicode
// Default_Ignorable_Code_Point set, because the old class omitted
// U+FE00-FE0F and U+2066-2069 and — gate and mark sharing the ONE
// predicate — a final made only of those characters wrote unseeable junk
// AND marked the parked entry, the round-9 loss path, not the "spurious
// mark" the old comment claimed. That rewrite staled NOTHING (no mutant
// anchored the return line — Sol round-10's own observation: R5i/R5j
// revert the two call sites but never mutate the class boundary), which is
// itself the gap v11 closes: R5k narrows the class back to the round-9
// form, and tests 39/40's fixtures widened to carry U+FE00/U+2066 so it
// has something to redden. Run11 measured every other radius UNCHANGED
// from v10. The v10 round's story: the matrix
// re-ran WHOLE for the Sol round-9 fix round (both the flushedOnce mark and
// the append's noise gate now run through dictatedVisibleContent — a
// zero-width/format character is not delivery, and \s never matched U+200B
// or U+2060 — see the R5 entries below) per the standing rule, and the
// staling lesson fired at its widest yet: the fix rewrote the marking line
// (staling ALL FOUR R5e–R5h find-strings) and replaced the append's bare
// `if (!text) return true;` (staling V6's anchor, which was re-anchored as
// an insert-early-copy with the SAME trigger set) — all 55 find-strings
// pre-verified to match exactly once BEFORE the run, and the verifier
// itself needed a fix first: its initial scanner assumed single-quoted
// find-strings, silently skipped N8's double-quoted one and graded N8
// against N9's anchor — a checker whose failure mode is a silent skip is
// not a check. v9's version: the round-8 fix rewrote the marking line,
// staling BOTH R5e's and R5f's find-strings (both anchored the /\S/ form).
// v8's version: the round-7 fix rewrote the same marking
// line, staling R5e's find-string alone. v7's version: the
// round-6 fix rewrote the one-line eviction into a block, staling
// R5a's and R5b's find-strings — both re-anchored; R5c's while-condition
// anchor survived by construction. v6's version: no anchor staled (the
// round-5 eviction line went ABOVE the push, so R4's and R3b's push-line
// anchors still matched — and R4's clear-then-push is still one-slot
// newest-wins under it, so the mutant stays faithful). v5's version of the
// staling lesson: rewriting the park mechanism for round 4 staled FIVE
// find-strings (R3b/R3c/R3d/R3e/V5, every mutant anchored on the old
// one-slot code) that were re-anchored before the run — a stale find-string
// reports 0 matches and the harness refuses to fake a result. v4's version:
// the round-3 park slot renamed onresult's `dictation.` reads to `session.`,
// staling SEVEN find-strings (N1/N2/N3/N6/F2b/F3/V5).
// v3's version of the same lesson: V9/N7's find-strings went stale when the
// clamp moved into clampDictatedValue, and N11 went stale BEHAVIORALLY, not
// just textually — under the stopping flag, onend now performs the full
// clear, so with the fake's synchronous stop()->onend, deleting
// stopDictation's own stopVoiceWave survived the old teardown tests. The
// real property is that the mic releases at STOP time, not when Chrome's
// onend eventually arrives; its test noops the fake's stop() and reads the
// track state in the gap. Same lesson one over: Kimi F7's resume() was
// UNOBSERVABLE until the fake AudioContext gained a state — it now starts
// 'suspended' deliberately, so the overlay's resume() call is what the
// assertion measures. A shipped branch no fixture can reach is exactly a
// clause pretending a test kills it. The v4 baseline also pins the exact
// expected pass count and zero skips (Sol round-3 P3): the suite skips
// wholesale when Chromium cannot launch, and a skipped run exits 0 with no
// ✖ — every mutant would "survive" while nothing executed.
// Harness + raw output: .claude/genesis-2026-08-07/agent-output/
// voice-r2-mutants{.mjs,-run12d.out}. 55 killed, TWO expected survivors, two
// clauses deliberately unmutated:
//   - delete the onPanels("click") [data-voice-dictate] branch
//       -> THIRTY-FOUR red: every test that clicks a PANEL mic — all of
//          v2's fifteen plus the panel-collapse hook test, the flush,
//          hard-clear, interim-pending, resultIndex, resurrect-pin,
//          surrogate, resume and stop-time-release tests, the three
//          round-3 tests (rebuild-guard, park-flush, parked-vanished), the
//          round-4 three-field test (its first two mics are panel mics),
//          the round-5 flood test, the round-6 eviction-prefers-flushed
//          test, the round-7 whitespace-only-final test, the round-8
//          clamped-final test, and the round-9 invisible-only and
//          zero-width-clamp tests (all ten mics in each are panel mics).
//          The modal-driven tests survive on the modal's own delegation; the
//          feature-absence test by design.
//   - EXPECTED SURVIVOR — appendDictatedText skips its input-event dispatch:
//          onresult dispatches input unconditionally after every event, so
//          the append-path dispatch is redundant through the only caller. It
//          stays because the function's contract is a self-contained commit
//          (and a double dispatch is idempotent); the survival is measured,
//          documented at the dispatch site, and NOT protected by any test.
//   - drop the speechRecognitionCtor() gate in voiceButtonMarkup
//       -> exactly "no recognizer, no mic button" red
//   - stopDictation clears state without calling recognizer.stop()
//       -> EIGHTEEN red: toggle-off, vanished-field, stale-onend,
//          feedback-modal, both hook tests, flush, hard-clear,
//          interim-pending, rebuild-guard, park-flush, the three-field
//          test, the flood test, the eviction-prefers-flushed test, the
//          whitespace-only-final test, the clamped-final test, and the
//          invisible-only and zero-width-clamp tests —
//          everything that asserts the
//          recognizer was actually STOPPED (stop-call count), which every
//          teardown route now converges on.
//   - remove the onend state reset
//       -> FOUR red: self-end reset, stale-onend (the stale test's live
//          session leans on onend for its own eventual clear), park-flush
//          and the three-field test — gutting onend also removes the parked
//          release, so their post-onend redispatches commit a second time.
//   - EXPECTED SURVIVOR — insert an early noise-return ahead of
//          appendDictatedText's field check (re-anchored in v10 as an
//          insert-early-copy when the round-9 fix rewrote the old bare
//          `if (!text) return true;` this mutant used to swap; SAME trigger
//          set — an empty/invisible final against a vanished field keeps
//          the session alive instead of ending it): onresult runs its own
//          field pre-check before calling here (its only caller), so the
//          internal ordering has no reachable trigger. Belt-and-braces for
//          a future direct caller; the pre-check itself is F3-mutated and
//          test-guarded now.
//   - weaken onend's identity guard from recognizer equality to bare dictation
//       -> THREE red: stale-onend, park-flush and the three-field test (all
//          replay an OLD recognizer's onend against a live later session; a
//          bare guard kills the session the user just started).
//   - delete the settings-modal click delegation for [data-voice-dictate]
//       -> SIX red: feedback-modal, both value-qualified tests, the modal
//          wave-canvas test, the modal-close hook test, and the three-field
//          test (its THIRD mic is the modal feedback mic) — all start
//          dictation from a modal button the panel handler can never see.
//   - drop the maxLength clamp at the FINALS call site (raw concat)
//       -> FOUR red: the maxLength cap test, the surrogate test, the
//          clamped-final test and the zero-width-clamp test. The surrogate
//          fixture's final overflows the cap, so an unclamped value fails
//          its exact-value assertion too; the clamped-final and
//          zero-width-clamp tests joined (v9, v10) because each one's own
//          PRECONDITION depends on the clamp — without it 'park1x' (or
//          ZWSP+'park1x') commits whole and the earlyTemplate assertion
//          fails. The invisible-only test correctly does NOT join: its
//          final never reaches the clamp — the noise gate declines it
//          first. Shared clamp, shared radius; the interim call site is a
//          separate mutant below.
//   - drop dictationQuery's settings-modal fallback (query panels only)
//       -> SIX red: feedback-modal, both value-qualified tests, the modal
//          wave-canvas test, the modal-close hook test, and the three-field
//          test — their target fields live in the modal.
//   - make syncModalVoiceButtons a no-op
//       -> THREE red: the feedback-modal test (render-once modal, nothing
//          else re-stamps aria-pressed), the modal wave-canvas test (the
//          sync is what inserts/removes the modal's canvas), and the
//          three-field test (it asserts the modal mic went live).
//   - strip the value qualifier in appendDictatedText's query
//       -> exactly the FINAL-routing value-qualified test red.
//   - strip the value qualifier in ONRESULT's field lookup
//       -> exactly the INTERIM-routing value-qualified test red. This mutant
//          SURVIVED the pre-fix round-2 suite: finals route through
//          appendDictatedText's own full-descriptor query, so only interim
//          streaming reaches the wrong sibling — the interim-routing test
//          exists because the matrix caught its absence.
//   - delete the strip-and-reinject block in onresult
//       -> SIX red: interim-replaces, final-replaces-interim, clamp-strip,
//          the resultIndex test, park-flush and the three-field test (their
//          parked flushes must strip the interims they left behind) — every
//          test that watches a later event replace an earlier injection.
//   - record the RAW interim as dictation.injected (not next.slice(base))
//       -> exactly the clamp-strip test red: the tracked chunk must carry the
//          separator and the clamp or the next strip removes the wrong bytes.
//   - strip unconditionally (drop the ends-with check)
//       -> exactly "a user edit mid-dictation wins" red.
//   - make onresult's input dispatch conditional on finals
//       -> exactly "interim text already in the box survives toggling the mic
//          off" red: an interim-only event must still reach the draft mirror
//          or the streamed text dies on the next panel rebuild.
//   - leave interimResults false
//       -> exactly the config test red (the fake's default is false, so the
//          assertion measures the overlay's assignment and nothing else).
//   - never write the interim into the field
//       -> NINE red: the five streaming tests, the interim-routing test, both
//          hook tests (their sessions are armed by a live interim) and the
//          resultIndex test — the interim write is their shared entry point,
//          a fact about the entry point and not nine independent guards.
//   - drop the maxLength clamp at the INTERIM call site (raw concat)
//       -> exactly the clamp-strip test red (separate call site from the
//          finals clamp; each has its own mutant).
//   - never render the wave canvas in voiceButtonMarkup
//       -> exactly "the wave canvas appears beside the live panel mic" red.
//   - modal sync never inserts the wave canvas / never removes it
//       -> each exactly the modal wave-canvas test red (it asserts both
//          directions of the render-once modal's lifecycle).
//   - stopDictation's stopping path skips stopVoiceWave()
//       -> exactly the stop-time-release test red — and ONLY that one, which
//          is the v3 gap closing: onend's clear covers the old teardown
//          tests under the fake's synchronous stop()->onend, so before that
//          test existed this mutant SURVIVED.
//   - delete the late-grant token guard in startVoiceWave
//       -> exactly "a permission grant landing after the session ended
//          releases the mic immediately" red.
//   - stopVoiceWave never stops tracks
//       -> TWO red: the teardown test and the stop-time-release test (both
//          read track stops; shared mechanism, shared radius).
//   - stopVoiceWave never closes the context
//       -> exactly the teardown test red (it asserts the close separately).
//   - delete the modal-close hook / the panel-collapse hook / gut the shared
//     stopDictationIfFieldInside helper
//       -> 1 / 1 / 2 red respectively: each call site has its own test, and
//          the helper mutant reddens exactly their union.
//   - revert stopDictation to null-before-stop (the pre-fix ordering)
//       -> TWO red: the flush test (the trailing final dies at the identity
//          guard) and the hard-clear test (a nulled session cannot be
//          stopping, so the 4-click sequence lands in the wrong state).
//   - inject the interim while stopping (drop the stopping ? "" gate)
//       -> exactly the flush test red: a stopped mic must not strand an
//          interim no later event will ever strip.
//   - delete stopDictation's hard-clear branch
//       -> exactly "a second stop on a stopping session hard-clears it" red.
//   - delete onresult's field pre-check (if (false) the whole block)
//       -> THREE red: "an interim pending against a vanished field ends the
//          session instead of throwing", the parked-vanished test AND — new
//          in v9 — the noise-only-final test. The neutralized block contains
//          BOTH the live stop and the parked release, a fact about the
//          shared block, not two guards. Through v8 the noise-only final
//          survived this mutant honestly: it emits a FINAL with nothing
//          injected, so appendDictatedText's own re-query rescued it and
//          the failure path still stopped the session. The round-8 fix put
//          the beforeAppend snapshot (`field.value`) between the pre-check
//          and that rescue, so a vanished field now throws at the snapshot
//          on ANY final — the pre-check's load-bearing duty grew from the
//          STRIP block alone to the strip block plus the snapshot. The
//          interim test still exists for the discrimination it was written
//          for (Kimi F3: the matrix had a hole exactly over a reachable
//          regression).
//   - rebuild the interim tail from event.resultIndex instead of scanning all
//       -> exactly "a resultIndex above an unchanged interim does not delete
//          it" red (Sol #1 — the spec allows unchanged interims below
//          resultIndex; rebuilding from it deletes text the event never
//          changed).
//   - replace the surrogate back-off with a raw slice
//       -> exactly "the maxLength clamp never splits a surrogate pair" red
//          (Sol #4).
//   - never set recognizer.lang
//       -> exactly the config test red (it asserts lang === the user's own
//          navigator.language, not the host document's — Kimi F4).
//   - delete the suspended-context resume()
//       -> exactly the resume test red (Kimi F7 — reachable ONLY because the
//          fake context now starts 'suspended'; before the fixture carried a
//          state, this mutant survived the whole suite).
//   - never commit finals (if (false) the appendDictatedText call)
//       -> SEVENTEEN red, including the resurrect PIN — which is the point
//          of this mutant: a pin that cannot go red pins nothing — plus the
//          park-flush, three-field, flood, eviction-prefers-flushed,
//          whitespace-only-final, clamped-final, invisible-only and
//          zero-width-clamp tests (a parked flush IS a finals commit).
//   ---- R3: the Sol round-3 fix mechanisms (the park mechanism itself; the
//        three-field test shares their radius because it exercises the same
//        park/release machinery with two entries instead of one) ----
//   - delete the renderPanel rebuild guard (the function's last statement)
//       -> exactly "a panel rebuild that drops the dictation field ends the
//          session during silence" red (Sol round-3 P1 — onresult's
//          vanished-field guard only fires on speech; without this a silent
//          user keeps a hot mic whose only off switch the rebuild removed).
//   - never park the prior session on a different-target mic click
//       -> EIGHT red: park-flush + three-field + flood +
//          eviction-prefers-flushed + whitespace-only-final +
//          clamped-final + invisible-only + zero-width-clamp. The late
//          flush finds no session and is dropped — the interim is never
//          stripped and the final never commits (the deterministic pre-fix
//          loss). The flood, eviction, whitespace, clamped-final,
//          invisible-only and zero-width-clamp tests joined this radius
//          (v6, v7, v8, v9, v10) because they drive nine-plus parks
//          through the same machinery — a fact about the mechanism, not an
//          extra guard.
//   - onresult resolves the live session only (ignore the parked list)
//       -> EIGHT red: park-flush + three-field + flood +
//          eviction-prefers-flushed + whitespace-only-final +
//          clamped-final + invisible-only + zero-width-clamp, same
//          observable as never-park: the parked flush's event finds no
//          owner.
//   - onend never releases the parked entry
//       -> TWO red: park-flush + three-field, on their post-onend REDISPATCH
//          assertions: a replayed final after onend commits a second time
//          into the parked field. Those assertions exist to make the release
//          observable — without them this mutant would survive honestly.
//   - delete the parked early-return in the vanished-field path
//       -> exactly the parked-vanished test red: the fallthrough calls
//          stopDictation(), which acts on the LIVE session — the new
//          dictation the user just started dies because the OLD one's
//          field went away.
//   ---- R4: the Sol round-4 fix (park is a LIST, not a one-slot) ----
//   - clear flushingDictations before each push (reintroduce the one-slot
//     newest-wins park verbatim — the Sol round-4 P2 defect)
//       -> SEVEN red: the three-field test, the flood test, the
//          eviction-prefers-flushed test, the whitespace-only-final test,
//          the clamped-final test, and the invisible-only and
//          zero-width-clamp tests. With a single park in flight a
//          slot and a list are indistinguishable, so every single-park test
//          stays green under this mutant. That is the round-4 finding
//          restated as a radius: A->B parks A, B->C overwrote A with B, and
//          A's delayed final resolved to neither live nor parked and was
//          silently discarded. At v5 this radius was exactly the
//          three-field test ("and ONLY that one"); the v6 flood, v7
//          eviction, v8 whitespace, v9 clamped-final and v10
//          invisible/zero-width tests widened it — under one-slot
//          newest-wins with nine-plus parks only the newest survives, so
//          the earlier parks all vanish and the exact-value assertions go
//          red.
//   ---- R5: the Sol round-5/6/7/8/9 fixes (the park list is BOUNDED, the
//        eviction is FLUSH-AWARE — evict the oldest entry whose post-stop
//        final actually LANDED, falling back to the oldest overall only
//        when none has flushed — and the mark is a VISIBLE-CONTENT FIELD
//        DELTA around the append: both sides of the comparison run through
//        dictatedVisibleContent, because the final's own text cannot
//        answer delivery from either side and neither can a raw value
//        delta: appendDictatedText reports success on a whitespace-only
//        final without committing anything (round 7), a substantive final
//        against a FULL field clamps to nothing — or to a bare separator
//        with one char of room — while still reading as real text
//        (round 8), and a zero-width/format character survives both a \s
//        strip and a truthiness check while the user sees nothing
//        (round 9 — \s never matched U+200B or U+2060; round 10 widened
//        the predicate's class from an ES5 approximation to the complete
//        Default_Ignorable_Code_Point set, because a lone U+FE00 or
//        U+2066 walked through the round-9 class and reproduced the same
//        loss path); without the bound
//        an entry whose recognizer never fires onend is retained forever,
//        without the flush preference the oldest UNFLUSHED entry —
//        possibly the only one still owed spoken text — dies first, and
//        with any text-based mark an entry that committed NOTHING is
//        preferentially evicted while its substantive final is still
//        coming) ----
//   - delete the whole eviction block (unbounded list again)
//       -> SIX red: the flood test (with the cap gone, s0 is never
//          evicted, its park0 commits, and the instruction field reads
//          "park0 park2 park4 park6 park8" against the expected eviction),
//          the eviction-prefers-flushed test (nothing is evicted, so
//          park1-late finds a live owner and commits a second template
//          value) and the whitespace-only-final, clamped-final,
//          invisible-only and zero-width-clamp tests (s0 is never evicted
//          in any of them, park0 commits).
//   - fallback evicts the NEWEST instead of the oldest (evictAt = 0 ->
//     length - 1)
//       -> FIVE red: the flood, whitespace-only-final, clamped-final,
//          invisible-only and zero-width-clamp tests — all five reach the
//          fallback because no entry is (legitimately) flushed at eviction
//          time in any of them. At v7 this was "exactly the flood test —
//          and ONLY that one"; the v8 whitespace test, v9 clamped-final
//          test and v10 invisible/zero-width tests joined because under
//          the fixed mark none of their early finals marks anything, so
//          their evictions also fall back to oldest — each widening is the
//          fix working. The eviction-prefers-flushed test still never
//          reaches the fallback (its s1 HAS flushed, the scan finds it).
//          One mutant per policy half; R5d/R5e below cover the scan half.
//   - off-by-one the cap (>= -> >)
//       -> SIX red: the flood test (a nine-park flood retains all nine,
//          so park0 commits; the fixture is DERIVED from the cap — nine
//          parks = one past MAX_PARKED_DICTATIONS = 8 — and the
//          park1..park8 assertions are the POSITIVE boundary separating
//          this mutant from cap-deleted), the eviction-prefers-flushed
//          test (all ten of its parks retained, park1-late commits) and
//          the whitespace-only-final, clamped-final, invisible-only and
//          zero-width-clamp tests (s0 retained in each, park0 commits).
//   - delete the flushedOnce scan (plain oldest-eviction again — the Sol
//     round-6 P2 defect verbatim)
//       -> exactly the eviction-prefers-flushed test red: with the scan
//          gone, unflushed s0 is evicted instead of flushed s1, its park0
//          never commits, and the instruction field reads
//          "park2 park4 park6 park8". The flood test stays green honestly —
//          no entry flushes there, so scan and fallback pick the same
//          victim — and so do the whitespace, clamped-final, invisible-only
//          and zero-width-clamp tests, for the same reason: under the
//          fixed mark none of their early finals marks anything, so
//          plain-oldest and fallback-oldest are the same eviction.
//   - never set flushedOnce (neutralize the marking line in onresult)
//       -> exactly the eviction-prefers-flushed test red: same observable
//          through the OTHER half of the mechanism — the scan runs but
//          finds nothing marked, so the fallback evicts s0. Two mutants,
//          one per half (mark and scan), one observable each.
//   - revert the mark to raw truthiness (`&& finals` instead of the field
//     delta — the Sol round-7 P2 defect verbatim; re-anchored in v9 when
//     the round-8 fix rewrote the marking line, and again in v10 when the
//     round-9 fix rewrote it once more)
//       -> FOUR red: the whitespace-only-final test (s1's whitespace final
//          marks it flushed despite committing nothing, the scan
//          preferentially evicts it, and its later substantive park1 dies
//          — the instruction field reads "park0 park2 park4 park6 park8"
//          and the template field loses park1, flipping BOTH exact-value
//          assertions), the clamped-final test ('park1x' is truthy, so
//          the raw mark also marks the entry whose final was clamped
//          away), and the invisible-only and zero-width-clamp tests
//          (a ZWSP-bearing final is truthy too, so the raw mark marks
//          entries that committed nothing the user can see in both).
//          Every other fixture's finals carry real text into roomy
//          fields, so raw truthiness and the field delta agree everywhere
//          else.
//   - revert the mark to carried text (`&& /\S/.test(finals)` — the Sol
//     round-8 P2 defect verbatim: the mark asks whether the final CARRIED
//     text, not whether it LANDED)
//       -> THREE red: the clamped-final test (s1's 'park1x' against the
//          full 5-cap field commits only the separator space, /\S/ marks
//          it flushed anyway, the user's shrink then makes it the
//          preferred eviction victim, and its later 'park1' — which now
//          FITS — dies) and the invisible-only and zero-width-clamp tests
//          (/\S/ MATCHES ZWSP and WORD JOINER — zero-width characters are
//          not \s — so the carried-text mark reads pure invisible noise
//          as text and marks entries that committed nothing visible).
//          The whitespace test stays green honestly: /\S/ correctly
//          declines pure whitespace, which is exactly why round 7 stopped
//          there and a round 8 was needed — and why the round-9 zero-width
//          class needed its own predicate beyond \S/\s entirely.
//   - weaken the mark to a bare value delta (`field.value !==
//     beforeAppend` — Sol's round-8 remedy taken literally, without any
//     visible-content comparison)
//       -> TWO red: the clamped-final test (with ONE char of room the
//          field gains exactly the separator space — a value change
//          carrying no delivered speech — so the bare delta marks the
//          entry and the eviction kills it, the same defect one character
//          over; this mutant is why the fixture fills the field to ONE
//          char short of the cap rather than exactly full) and the
//          zero-width-clamp test (the field gains the separator plus the
//          three invisible leads — a value change with no visible delta).
//          The whitespace and
//          invisible-only tests stay green honestly: in both, the noise
//          gate declines the final before any write, so the field never
//          changes and even a bare delta sees nothing.
//   - revert the mark to the round-8 whitespace-strip field delta (the
//     Sol round-9 P2 defect verbatim: compare both sides with \s stripped)
//       -> exactly the zero-width-clamp test red: the clamp retains the
//          separator plus the three invisible leads, and a \s-strip delta
//          reads that as delivery — \s matches none of them — so the entry
//          is marked and
//          preferentially evicted, and its later 'park1' dies. The
//          invisible-only test stays green honestly: the append gate
//          declines its final before any write, the field never changes,
//          and both predicates agree on an unchanged field — which is
//          exactly why the clamp test exists (the gate MASKS the mark for
//          pure-invisible finals; only a clamped write exposes it).
//   - revert the append noise gate to bare emptiness (`if (!text) return
//     true;` — the pre-round-9 gate)
//       -> exactly the invisible-only test red, on its committed-nothing
//          precondition (earlyTemplate === ''): the invisible run is
//          truthy, so the bare gate lets the final through and it writes
//          unseeable junk into the field. Every other fixture's finals
//          are either substantively visible or classic whitespace, which
//          both gates answer identically.
//   - narrow the class back to the round-9 form (the Sol round-10 P2
//     defect verbatim: drop U+FE00-U+FE0F, U+2066-U+2069, and the rest of
//     the Default_Ignorable additions from the predicate's regex)
//       -> TWO red: the invisible-only test (its widened fixture carries
//          U+FE00 and U+2066, which the narrowed class wrongly calls
//          visible — the gate passes, the write breaks the
//          committed-nothing precondition) and the zero-width-clamp test
//          (the narrowed class sees the retained U+FE00/U+2066 as a
//          visible delta, marks the entry, and the eviction kills its
//          later 'park1'). R5k and R5l below are the only mutants that
//          touch the class BOUNDARY itself — R5i/R5j revert the two call
//          sites and would both stay green under a narrowed class, which
//          is how the round-9 class shipped with 53/55 killed and the gap
//          unmeasured. Any class change must move these find-strings with
//          it, or the harness's anchor preflight kills the run: as of the
//          Sol round-12 P3 fix a stale anchor exits nonzero BEFORE the
//          baseline (the old shape printed "not applied" and continued to
//          matrix-exit:0). The round-11 fix staled R5k's anchor, which was
//          migrated to the v12 line before the run.
//   - narrow the plane-14 lead surrogate back to the single 0xDB40 (the
//     Sol round-11 P2 defect verbatim — the v11 form of the class, R5l)
//       -> exactly the invisible-only test red: its fixture's fifth
//          invisible character is U+E0400 (the surrogate pair DB41 DC00),
//          the first code point past the single-lead alternation's reach —
//          the narrowed class calls it visible, the gate passes the final,
//          and the write breaks the committed-nothing precondition. The
//          zero-width-clamp test stays green honestly: its fixture's
//          invisible leads are BMP (U+200B/U+FE00/U+2066), which both
//          forms of the class strip identically. U+E0400 is the only
//          assertion separating the lead RANGE from the single lead —
//          without it the whole v11 matrix stayed green under exactly
//          this mutant.
// Deliberately UNMUTATED, with reasons (two clauses):
// (1) onresult's FINALS loop start (`event.resultIndex || 0`). Finals are
// immutable and reported exactly once, so a flip to bare 0 only re-reads
// finals real Chrome never re-sends; the fake's full-snapshot events cannot
// see the difference. The INTERIM loop's start IS mutated now (Sol1 above) —
// the fix moved it to 0 and the resultIndex test can see a revert.
// (2) the parked early-return in onresult's appendDictatedText-FAILURE path.
// The pre-check and appendDictatedText query the SAME descriptor with
// nothing running between them, so no input reaches that clause; it is
// belt-and-braces for a future reordering. A clause with no reachable
// trigger must say so, not pretend a test kills it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  test('playwright available for overlay voice-input test', (t) => {
    t.skip(`playwright not installed (${err.message})`);
  });
  process.exit(0);
}

const bridge = await import('../dist/grab-bridge.js');

// The fake mirrors the two structural facts the overlay's onresult handler
// depends on: results is indexable from event.resultIndex, and each result
// carries isFinal plus an alternatives list whose [0] has a transcript.
const FAKE_RECOGNIZER = `
<script>
  window.__voiceFake = { instances: [] };
  window.SpeechRecognition = class {
    constructor() {
      this.started = 0;
      this.stopped = 0;
      this.continuous = false;
      // false so the interimResults=true assertion measures the overlay's own
      // assignment — a fake defaulting to true could never fail that test.
      this.interimResults = false;
      window.__voiceFake.instances.push(this);
    }
    start() { this.started += 1; }
    stop() {
      this.stopped += 1;
      if (this.onend) this.onend({});
    }
    emitFinal(text) {
      if (this.onresult) this.onresult({
        resultIndex: 0,
        results: [{ 0: { transcript: text }, isFinal: true, length: 1 }]
      });
    }
    emitInterim(text) {
      // Real Chrome keeps resultIndex at the first CHANGED result and replaces
      // the interim in place, so each event carries the full current interim
      // snapshot — which is exactly why the overlay strips its previous
      // injection before writing the new one.
      if (this.onresult) this.onresult({
        resultIndex: 0,
        results: [{ 0: { transcript: text }, isFinal: false, length: 1 }]
      });
    }
  };
</script>`;

const HOST_PAGE = `<!doctype html><html><head><title>voice host</title></head><body>
<h1 id="heading">Host page</h1>${FAKE_RECOGNIZER}
</body></html>`;

// Fake media pipeline for the waveform teardown tests. getUserMedia grants are
// held in pending[] so a test controls WHEN the grant lands relative to the
// session ending — the late-grant race is unreachable with an auto-resolving
// fake. navigator.mediaDevices is an accessor with no setter, so the override
// has to go through defineProperty.
const FAKE_MEDIA = `
<script>
  window.__waveFake = { streams: [], contexts: [], pending: [] };
  window.__waveFake.grant = function () {
    const track = { stopCalls: 0, stop() { this.stopCalls += 1; } };
    const stream = { tracks: [track], getTracks() { return this.tracks; } };
    window.__waveFake.streams.push(stream);
    const resolve = window.__waveFake.pending.shift();
    if (resolve) resolve(stream);
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia() {
        return new Promise((resolve) => { window.__waveFake.pending.push(resolve); });
      }
    }
  });
  window.AudioContext = class {
    // Starts 'suspended' deliberately: Chrome can deliver a context in that
    // state when the permission prompt outlives the click's activation, and
    // a suspended context paints a permanently flat wave (Kimi F7). The
    // fixture models the bad case so the overlay's resume() call is what the
    // assertion measures.
    constructor() {
      this.closeCalls = 0;
      this.resumeCalls = 0;
      this.state = 'suspended';
      window.__waveFake.contexts.push(this);
    }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 128, getByteTimeDomainData() {} }; }
    createMediaStreamSource() { return { connect() {} }; }
    resume() { this.resumeCalls += 1; this.state = 'running'; }
    close() { this.closeCalls += 1; }
  };
</script>`;

const WAVE_HOST_PAGE = `<!doctype html><html><head><title>wave host</title></head><body>
<h1 id="heading">Host page</h1>${FAKE_RECOGNIZER}${FAKE_MEDIA}
</body></html>`;

// Both constructors forced absent: headless Chromium DOES define
// webkitSpeechRecognition, so without this the button renders everywhere and
// the feature-detection test measures nothing.
const NO_SPEECH_PAGE = `<!doctype html><html><head><title>no speech</title></head><body>
<h1 id="heading">Host page</h1>
<script>
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = undefined;
</script>
</body></html>`;

async function withOverlay(fn, hostPage) {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(hostPage || HOST_PAGE);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port;

  const dir = await mkdtemp(path.join(tmpdir(), 'raven-voice-'));
  const designPath = path.join(dir, 'DESIGN.md');
  await writeFile(designPath, '---\ncolor:\n  text:\n    primary: "#ffffff"\n---\n\n# Fixture\n', 'utf8');

  const session = await bridge.startGrabSession(designPath, undefined, upstreamUrl, 'consumer');
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(session.url + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('[data-raven-grab-overlay]')?.shadowRoot), null, { timeout: 15000 });
    return await fn(page);
  } finally {
    if (browser) await browser.close();
    await bridge.stopGrabSession();
    await new Promise((resolve) => upstream.close(resolve));
  }
}

function skipIfNoBrowser(t, err) {
  if (/browserType\.launch|Executable doesn't exist/.test(err.message)) {
    t.skip(`browser unavailable for overlay voice input (${err.message})`);
    return true;
  }
  return false;
}

const shadowEval = (fnBody) => `(() => {
  const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
  ${fnBody}
})()`;

test('clicking the mic starts a correctly configured recognizer and marks the button live', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const mic = root.querySelector('[data-voice-dictate="data-instruction"]');
        if (!mic) return { error: 'no instructions mic button in the overlay' };
        mic.click();
        const fake = window.__voiceFake.instances[0];
        const after = root.querySelector('[data-voice-dictate="data-instruction"]');
        return {
          instances: window.__voiceFake.instances.length,
          started: fake ? fake.started : 0,
          continuous: fake ? fake.continuous : null,
          interimResults: fake ? fake.interimResults : null,
          lang: fake ? fake.lang : null,
          navLang: navigator.language,
          pressed: after ? after.getAttribute('aria-pressed') : null
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.instances, 1, 'exactly one recognizer per dictation session');
  assert.equal(result.started, 1, 'the recognizer was never started');
  assert.equal(result.continuous, true, 'dictation must be continuous — the default cuts off after one phrase');
  assert.equal(result.interimResults, true,
    'round 2 streams interim text live (Andrew, 2026-08-07) — a finals-only recognizer shows nothing until a phrase completes');
  assert.ok(result.navLang, 'fixture check: the browser must report a locale for the lang assertion to measure anything');
  assert.equal(result.lang, result.navLang,
    'recognizer.lang must be the USER\'S locale, not the host document\'s — unset, dictating English on a lang="ja" page transcribes as Japanese (Kimi F4)');
  assert.equal(result.pressed, 'true', 'the re-rendered mic button does not show dictation as live');
});

test('a dictated transcript lands in the textarea and survives a panel re-render', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitFinal('Make the hero blue');
        const liveValue = root.querySelector('[data-instruction]').value;
        fake.emitFinal('and the footer dark');
        const appendedValue = root.querySelector('[data-instruction]').value;
        // Toggling off runs renderPanel(), which rebuilds the textarea from the
        // module-level draft. If the transcript only ever touched the NODE, it
        // dies right here — this is the assertion the input-event dispatch
        // mechanism exists for.
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const survivedValue = root.querySelector('[data-instruction]').value;
        return { liveValue, appendedValue, survivedValue };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.liveValue, 'Make the hero blue', 'the first final transcript never reached the textarea');
  assert.equal(result.appendedValue, 'Make the hero blue and the footer dark',
    'a second final transcript must append with a separating space, not replace');
  assert.equal(result.survivedValue, 'Make the hero blue and the footer dark',
    'the transcript died on a panel re-render: it reached the node but never the instruction draft');
});

test('toggling the mic off stops the recognizer and releases the button state', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const after = root.querySelector('[data-voice-dictate="data-instruction"]');
        return { stopped: fake.stopped, pressed: after.getAttribute('aria-pressed') };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.stopped, 1,
    'the recognizer was never stopped — the mic keeps listening after the button reads off');
  assert.equal(result.pressed, 'false', 'the button still shows dictation as live after toggling off');
});

test('a recognizer that ends on its own resets the button', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        // Chrome ends recognition unilaterally after silence; the overlay only
        // learns about it from onend. No stop() call happens in this path.
        fake.onend({});
        const after = root.querySelector('[data-voice-dictate="data-instruction"]');
        return { pressed: after.getAttribute('aria-pressed'), stopped: fake.stopped };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.stopped, 0, 'fixture check: this path must not have called stop()');
  assert.equal(result.pressed, 'false',
    'the button shows dictation as live after the recognizer ended on its own');
});

test('a noise-only final against a vanished field still ends the session', async (t) => {
  // Adverse-pass finding (Kimi K3, 2026-08-07): the empty-text early return
  // used to run BEFORE the field-existence check, so a whitespace-only final
  // — which Chrome emits on ambient noise — arriving after the user
  // navigated away left the recognizer live forever. The field nodes are
  // removed directly (not via a re-render, which would rebuild them) so
  // panelQuery genuinely finds nothing.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        root.querySelectorAll('[data-instruction]').forEach((el) => el.remove());
        fake.emitFinal('   ');
        return { stopped: fake.stopped };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.stopped, 1,
    'a noise-only final skipped the field check and left the mic listening against a panel with no field');
});

test('a stale onend from a replaced recognizer does not kill the live session', async (t) => {
  // On real Chrome, onend arrives on a later task after stop() — the fake's
  // synchronous onend cannot model that, so the stale delivery is replayed
  // by hand: recognizer 1 is stopped and a NEW session started, then
  // recognizer 1's onend fires again. Only the dictation.recognizer
  // identity guard keeps the new session alive.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const mic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        mic().click();
        const first = window.__voiceFake.instances[0];
        mic().click(); // off — first.stop() fires its sync onend, a no-op
        mic().click(); // on again with a fresh recognizer
        first.onend({}); // the async delivery real Chrome would send late
        return {
          instances: window.__voiceFake.instances.length,
          pressed: mic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.instances, 2, 'fixture check: the second toggle-on must mint a fresh recognizer');
  assert.equal(result.pressed, 'true',
    'a stale onend from the replaced recognizer tore down the live session — the identity guard is gone');
});

test('a dictated append honours the field\'s own maxLength cap', async (t) => {
  // maxLength constrains TYPING, not assignment — setting .value walks right
  // past it — so appendDictatedText clamps to the field's own cap or a long
  // dictation ships a value the form promised its consumer it never would
  // (the note fields promise 2000, the feedback form promises 5000). The cap
  // is stamped on the live node here because the instruction textarea carries
  // none of its own; appendDictatedText reads field.maxLength at result time,
  // so the node being queried is the node that was stamped.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        const field = root.querySelector('[data-instruction]');
        field.maxLength = 20;
        fake.emitFinal('this transcript is far longer than twenty characters');
        return { value: root.querySelector('[data-instruction]').value };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.value.length, 20,
    'the dictated append walked past the field\'s maxLength: ' + JSON.stringify(result.value));
  assert.equal(result.value, 'this transcript is f', 'and the clamp is a truncation, not a rejection');
});

test('the feedback mic dictates into the settings-modal field and syncs its own state', async (t) => {
  // The feedback form lives in the settings modal, which is render-once: unlike
  // the panels its mic never passes back through voiceButtonMarkup, so
  // renderPanel() alone leaves its aria-pressed stale. syncModalVoiceButtons
  // stamps it directly at every dictation state change — delete those calls and
  // the pressed assertions here go red while every panel test stays green.
  // The click also exercises the modal's OWN [data-voice-dictate] delegation:
  // the panel's delegated listener never sees modal clicks (siblings in the
  // shadow root).
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const modal = root.querySelector('.raven-grab-settings-modal') ||
          Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        const mic = modal ? modal.querySelector('[data-voice-dictate="data-feedback-message"]') : null;
        if (!mic) return { error: 'no feedback mic in the settings modal' };
        mic.click();
        const pressedLive = mic.getAttribute('aria-pressed');
        const fake = window.__voiceFake.instances[0];
        fake.emitFinal('The layers tab is hard to find');
        const value = modal.querySelector('[data-feedback-message]').value;
        mic.click();
        const pressedAfter = mic.getAttribute('aria-pressed');
        return { pressedLive, value, pressedAfter, stopped: fake.stopped };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.pressedLive, 'true',
    'the modal mic never learned dictation started — renderPanel cannot reach a render-once modal');
  assert.equal(result.value, 'The layers tab is hard to find',
    'the transcript never reached the feedback field — dictationQuery does not cover the modal');
  assert.equal(result.stopped, 1, 'the second click must stop the recognizer through the modal delegation');
  assert.equal(result.pressedAfter, 'false', 'the modal mic shows dictation live after it ended');
});

test('a value-qualified descriptor routes the transcript to exactly its own instance', async (t) => {
  // data-template-note exists once per expanded note across rebuilds, so its
  // mic carries a value-qualified descriptor (data-template-note='<id>') — the
  // selector text IS the descriptor, and the button, the active-state check,
  // and the result-time query can never disagree about which instance a
  // session belongs to. The fixture plants two instances plus a button in the
  // settings modal because the modal is the one surface renderPanel() never
  // rebuilds — the panel's own template flow would wipe planted nodes at the
  // toggle's first render. Synthetic placement, real mechanism: the click
  // travels the modal delegation, toggleDictation, and appendDictatedText's
  // result-time query exactly as the template tab's own mic does.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const modal = Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        if (!modal) return { error: 'no settings modal to plant the fixture in' };
        const holder = document.createElement('div');
        holder.innerHTML = '<textarea data-template-note="1"></textarea>' +
          '<textarea data-template-note="2"></textarea>' +
          '<button type="button" data-voice-dictate="data-template-note=\\'2\\'">mic</button>';
        modal.appendChild(holder);
        holder.querySelector('button').click();
        const fake = window.__voiceFake.instances[0];
        if (!fake) return { error: 'the value-qualified click never started a recognizer' };
        fake.emitFinal('into slot two');
        return {
          first: holder.querySelector('[data-template-note="1"]').value,
          second: holder.querySelector('[data-template-note="2"]').value
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.second, 'into slot two', 'the qualified instance never received its transcript');
  assert.equal(result.first, '',
    'the transcript leaked into a SIBLING instance of the same attribute — the descriptor\'s ' +
    'value qualifier is being dropped at query time');
});

test('interim text on a value-qualified descriptor streams into exactly its own instance', async (t) => {
  // The final-routing test above cannot see this: finals commit through
  // appendDictatedText, which does its own full-descriptor query, so a
  // qualifier dropped in ONRESULT's field lookup still routes finals
  // correctly while every interim snapshot streams into the FIRST bare-match
  // sibling. Measured — the matrix's V12b mutant survived all 19 prior tests
  // for exactly that reason. Same planted-modal fixture as the final test;
  // only the emission is interim.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const modal = Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        if (!modal) return { error: 'no settings modal to plant the fixture in' };
        const holder = document.createElement('div');
        holder.innerHTML = '<textarea data-template-note="1"></textarea>' +
          '<textarea data-template-note="2"></textarea>' +
          '<button type="button" data-voice-dictate="data-template-note=\\'2\\'">mic</button>';
        modal.appendChild(holder);
        holder.querySelector('button').click();
        const fake = window.__voiceFake.instances[0];
        if (!fake) return { error: 'the value-qualified click never started a recognizer' };
        fake.emitInterim('interim for slot two');
        return {
          first: holder.querySelector('[data-template-note="1"]').value,
          second: holder.querySelector('[data-template-note="2"]').value
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.second, 'interim for slot two', 'the qualified instance never received its interim');
  assert.equal(result.first, '',
    'interim text streamed into a SIBLING instance — onresult\'s field lookup dropped the ' +
    'value qualifier that appendDictatedText still honours');
});

test('interim text streams into the field live, and each snapshot REPLACES the last', async (t) => {
  // Round 2 (Andrew, 2026-08-07: "voice would be way better if it live
  // streamed it into the box"). Chrome re-emits the whole current interim on
  // every result event, so appending naively stacks "make the make the hero"
  // — the strip-and-reinject in onresult is what this test kills.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('make the');
        const first = root.querySelector('[data-instruction]').value;
        fake.emitInterim('make the hero');
        const second = root.querySelector('[data-instruction]').value;
        return { first, second };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.first, 'make the', 'the first interim never reached the field — nothing is streaming');
  assert.equal(result.second, 'make the hero',
    'the second interim stacked beside the first instead of replacing it: ' + JSON.stringify(result.second));
});

test('a final replaces the interim it grew from and resets the injection tracking', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('make the hero');
        fake.emitFinal('make the hero blue');
        const afterFinal = root.querySelector('[data-instruction]').value;
        // If the tracking survived the final, this strip would eat committed
        // text; if it reset, the new interim simply appends.
        fake.emitInterim('and the');
        const afterNextInterim = root.querySelector('[data-instruction]').value;
        return { afterFinal, afterNextInterim };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.afterFinal, 'make the hero blue',
    'the final must replace its own interim, not sit beside it');
  assert.equal(result.afterNextInterim, 'make the hero blue and the',
    'the injection tracking outlived the final and mangled the committed text');
});

test('interim text already in the box survives toggling the mic off (promote-on-stop)', async (t) => {
  // Stopping mid-word must keep what the user watched appear. The toggle-off
  // runs renderPanel(), which rebuilds the textarea from the module draft —
  // so this only holds if the interim writes dispatched input events too.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitFinal('keep the header');
        fake.emitInterim('and the foo');
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        return { value: root.querySelector('[data-instruction]').value };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.value, 'keep the header and the foo',
    'the streamed interim died on the stop re-render — it reached the node but never the draft');
});

test('a user edit mid-dictation wins: the tracking drops instead of eating their text', async (t) => {
  // The strip only fires when the field still ENDS with the injected chunk.
  // A user who edits mid-dictation breaks that suffix — their text must be
  // left alone (the old interim silently promotes to kept text) and the next
  // interim appends after it.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('draft one');
        const field = root.querySelector('[data-instruction]');
        field.value = 'user typed something';
        fake.emitInterim('draft two');
        return { value: root.querySelector('[data-instruction]').value };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.value, 'user typed something draft two',
    'the stale-injection strip ran against user-edited text: ' + JSON.stringify(result.value));
});

test('an interim append clamps to maxLength and the strip removes exactly the clamped chunk', async (t) => {
  // The tracking records what actually LANDED (post-clamp), not what was
  // heard — otherwise the next strip removes more than was injected and eats
  // committed text off the end of the field.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        const field = root.querySelector('[data-instruction]');
        field.maxLength = 20;
        fake.emitInterim('this interim is far longer than twenty characters');
        const clamped = root.querySelector('[data-instruction]').value;
        fake.emitInterim('short');
        const replaced = root.querySelector('[data-instruction]').value;
        return { clamped, replaced };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.clamped.length, 20, 'the interim walked past maxLength: ' + JSON.stringify(result.clamped));
  assert.equal(result.replaced, 'short',
    'the strip did not remove exactly the clamped chunk: ' + JSON.stringify(result.replaced));
});

test('the wave canvas appears beside the live panel mic and leaves with the session', async (t) => {
  // This measures the MARKUP mechanism — voiceButtonMarkup renders the
  // [data-voice-wave] canvas only for the active descriptor, so at most one
  // exists in the tree. The paint pipeline behind it (getUserMedia →
  // AnalyserNode → rAF) is deliberately fail-soft and unasserted here:
  // headless Chromium denies getUserMedia, which is exactly the denial path
  // real users hit, and dictation must survive it.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const live = root.querySelectorAll('[data-voice-wave]').length;
        const mic = root.querySelector('[data-voice-dictate="data-instruction"]');
        const inSlot = Boolean(mic.parentNode && mic.parentNode.querySelector('[data-voice-wave]'));
        mic.click();
        const after = root.querySelectorAll('[data-voice-wave]').length;
        return { live, inSlot, after };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.live, 1, 'no wave canvas rendered beside the live mic');
  assert.equal(result.inSlot, true, 'the wave canvas rendered somewhere other than the active mic\'s own slot');
  assert.equal(result.after, 0, 'the wave canvas outlived the dictation session');
});

test('the render-once modal gets its wave canvas inserted and removed by the sync', async (t) => {
  // The panels regenerate the canvas through voiceButtonMarkup; the settings
  // modal never re-renders, so syncModalVoiceButtons owns both directions of
  // its canvas lifecycle. Delete that insert/remove and this goes red while
  // every panel test stays green.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const modal = Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        const mic = modal ? modal.querySelector('[data-voice-dictate="data-feedback-message"]') : null;
        if (!mic) return { error: 'no feedback mic in the settings modal' };
        mic.click();
        const live = modal.querySelectorAll('[data-voice-wave]').length;
        mic.click();
        const after = modal.querySelectorAll('[data-voice-wave]').length;
        return { live, after };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.live, 1, 'the sync never inserted a wave canvas into the render-once modal');
  assert.equal(result.after, 0, 'the sync never removed the modal\'s wave canvas when dictation ended');
});

test('ending dictation releases the wave\'s microphone stream and closes its context', async (t) => {
  // The one real harm in the wave engine: a MediaStreamTrack left running
  // keeps the browser's recording indicator lit after the user stopped
  // dictating. The fake grants immediately, the session ends, and both
  // halves of the teardown must have fired.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(`(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        window.__waveFake.grant();
        await new Promise((r) => setTimeout(r, 0));
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__waveFake;
        return {
          streams: fake.streams.length,
          contexts: fake.contexts.length,
          trackStops: fake.streams.length ? fake.streams[0].tracks[0].stopCalls : 0,
          contextCloses: fake.contexts.length ? fake.contexts[0].closeCalls : 0
        };
      })()`);
    }, WAVE_HOST_PAGE);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.streams, 1, 'fixture check: the wave never requested the microphone');
  assert.equal(result.contexts, 1, 'fixture check: the wave never built an audio context');
  assert.ok(result.trackStops >= 1,
    'the microphone track was never stopped — the recording indicator stays lit after dictation ends');
  assert.ok(result.contextCloses >= 1, 'the audio context was never closed');
});

test('a permission grant landing after the session ended releases the mic immediately', async (t) => {
  // The permission prompt can outlive the dictation session: the user clicks
  // the mic, a browser prompt appears, they stop dictation, THEN allow. The
  // token guard in startVoiceWave must stop the tracks of that late stream
  // rather than adopt it for a dead session.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(`(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const mic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        mic().click();
        mic().click(); // session over — the grant is still pending
        window.__waveFake.grant();
        await new Promise((r) => setTimeout(r, 0));
        const fake = window.__waveFake;
        return {
          streams: fake.streams.length,
          trackStops: fake.streams.length ? fake.streams[0].tracks[0].stopCalls : 0,
          contexts: fake.contexts.length
        };
      })()`);
    }, WAVE_HOST_PAGE);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.streams, 1, 'fixture check: the grant never produced a stream');
  assert.ok(result.trackStops >= 1,
    'a stream granted after the session ended was adopted instead of released — the mic stays hot');
  assert.equal(result.contexts, 0, 'no audio context should be built for a dead session');
});

test('no recognizer, no mic button — and the composer is otherwise intact', async (t) => {
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        return {
          micButtons: root.querySelectorAll('[data-voice-dictate]').length,
          hasInstructions: Boolean(root.querySelector('[data-instruction]'))
        };
      `));
    }, NO_SPEECH_PAGE);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.micButtons, 0,
    'a mic button rendered with no SpeechRecognition available — feature detection is gone');
  assert.equal(result.hasInstructions, true,
    'fixture check: the composer itself must render regardless of speech support');
});

test('closing the settings modal ends a live feedback dictation (hidden is not gone)', async (t) => {
  // The modal is render-once and HIDES on close — its textarea stays
  // queryable, so the vanished-field guard can never fire, and the only stop
  // control (the mic beside the field) is hidden with it: a hot microphone
  // with no reachable off switch (Kimi F1 / Sol #2, 2026-08-07). The hook
  // sits AFTER closeSettingsModal's open-guard, so this test must actually
  // OPEN the modal first — a mic click alone (the older modal test's shape)
  // never reaches it.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const opener = root.querySelector('[data-settings-open]');
        if (!opener) return { error: 'no settings-open trigger in the overlay' };
        opener.click();
        const modal = root.querySelector('.raven-grab-settings-modal') ||
          Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        const mic = modal ? modal.querySelector('[data-voice-dictate="data-feedback-message"]') : null;
        if (!mic) return { error: 'no feedback mic in the settings modal' };
        if (modal.hidden) return { error: 'fixture: the modal did not open' };
        mic.click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('the layers tab');
        const during = modal.querySelector('[data-feedback-message]').value;
        const closer = modal.querySelector('[data-settings-close]');
        if (!closer) return { error: 'no settings-close button in the modal' };
        closer.click();
        return {
          during,
          hidden: modal.hidden,
          stopped: fake.stopped,
          pressed: mic.getAttribute('aria-pressed'),
          fieldStillThere: Boolean(modal.querySelector('[data-feedback-message]'))
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.during, 'the layers tab', 'fixture check: dictation must be live before the close');
  assert.equal(result.hidden, true, 'fixture check: the close button must actually close the modal');
  assert.equal(result.fieldStillThere, true,
    'fixture check: a REMOVED field would be the vanished-field guard\'s case, not this one');
  assert.equal(result.stopped, 1,
    'closing the modal left the recognizer live — a hot mic behind a hidden surface with its stop control hidden too');
  assert.equal(result.pressed, 'false', 'the modal mic still shows dictation as live after the close');
});

test('collapsing the panels ends a live instructions dictation (hidden is not gone)', async (t) => {
  // Same class as the modal case, panel leg: collapse hides (inert +
  // off-screen transform), the field stays in the DOM, and every collapse
  // route converges on setPanelCollapsed — the "page" layout tile drives it
  // here the way a user would (Kimi F1 / Sol #2, 2026-08-07).
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('half a thought');
        const during = root.querySelector('[data-instruction]').value;
        const tile = root.querySelector('[data-panel-preset="page"]');
        if (!tile) return { error: 'no page layout tile in the overlay' };
        tile.click();
        const field = root.querySelector('[data-instruction]');
        return {
          during,
          stopped: fake.stopped,
          fieldStillThere: Boolean(field),
          collapsed: Boolean(field && field.closest('[data-collapsed="true"]'))
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.during, 'half a thought', 'fixture check: dictation must be live before the collapse');
  assert.equal(result.fieldStillThere, true,
    'fixture check: a collapsed panel must HIDE its field, not remove it — removal is the other guard\'s case');
  assert.equal(result.collapsed, true, 'fixture check: the page tile must actually collapse the field\'s panel');
  assert.equal(result.stopped, 1,
    'collapsing the panels left the recognizer live — a hot mic against a hidden field');
});

test('a final flushed between stop() and onend still commits, and its interim does not', async (t) => {
  // Real Chrome's stop() (unlike abort()) flushes pending audio as ONE last
  // final onresult BEFORE onend — and Chrome often emits no interim at all
  // for a short utterance, so nulling the session at stop time silently
  // drops the whole word the user watched being recognized (Kimi F2,
  // 2026-08-07). The fake's stop() fires onend synchronously, which is
  // exactly the ordering that HIDES this — so the fake's stop is nooped and
  // real Chrome's delivery is replayed by hand.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const mic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        mic().click();
        const fake = window.__voiceFake.instances[0];
        fake.stop = function () { this.stopped += 1; }; // real Chrome: onend arrives LATER
        mic().click(); // user stop — session now stopping, not cleared
        const pressedWhileStopping = mic().getAttribute('aria-pressed');
        // The flush: one final plus a trailing interim fragment in one event.
        fake.onresult({
          resultIndex: 0,
          results: [
            { 0: { transcript: 'blue' }, isFinal: true, length: 1 },
            { 0: { transcript: 'tail' }, isFinal: false, length: 1 }
          ]
        });
        const value = root.querySelector('[data-instruction]').value;
        fake.onend({}); // Chrome's real onend, on a later task
        return {
          pressedWhileStopping,
          value,
          stopped: fake.stopped,
          pressedAfter: mic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.stopped, 1, 'fixture check: the stop click must reach the recognizer');
  assert.equal(result.pressedWhileStopping, 'false',
    'a stopping session must already read INACTIVE — the user asked for the mic to be off');
  assert.equal(result.value, 'blue',
    'the flushed final was dropped (or its interim leaked): ' + JSON.stringify(result.value) +
    ' — a short utterance with no prior interim vanishes entirely');
  assert.equal(result.pressedAfter, 'false', 'onend must clear the stopping session');
});

test('a second stop on a stopping session hard-clears it — no wedged state a click cannot leave', async (t) => {
  // If onend never arrives (recognizer died, engine bug), the stopping
  // session would otherwise be permanent: the mic reads inactive, but
  // toggleDictation sees a live session and every click just re-runs the
  // stop path. The second stop's hard-clear branch is the escape hatch.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        const mic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        mic().click();
        const first = window.__voiceFake.instances[0];
        first.stop = function () { this.stopped += 1; }; // onend never arrives
        mic().click(); // stopping
        mic().click(); // second stop — hard-clear
        mic().click(); // must start a FRESH session
        return {
          instances: window.__voiceFake.instances.length,
          firstStopped: first.stopped,
          pressed: mic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.firstStopped, 1, 'fixture check: the first stop must have reached recognizer 1');
  assert.equal(result.instances, 2,
    'the fourth click never minted a fresh recognizer — the stopping session wedged and no click can leave it');
  assert.equal(result.pressed, 'true', 'the fresh session must show live on the mic');
});

test('an interim pending against a vanished field ends the session instead of throwing', async (t) => {
  // The onresult pre-check is load-bearing for the STRIP block, not a mirror
  // of appendDictatedText's ordering: with an interim pending
  // (dictation.injected non-empty), a removed field sends field.value.slice
  // into a TypeError that escapes the handler — no stop path runs and the
  // mic stays hot until the user happens to click a mic again (Kimi F3,
  // 2026-08-07). The existing vanished-field test emits a FINAL with
  // injected === "", so appendDictatedText's own guard rescues it and the
  // pre-check-deleted mutant survives it.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('pending interim');
        root.querySelectorAll('[data-instruction]').forEach((el) => el.remove());
        let threw = null;
        try {
          fake.emitInterim('next chunk');
        } catch (err) {
          threw = String(err);
        }
        return { stopped: fake.stopped, threw };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.threw, null,
    'the strip block ran against a missing field and the TypeError escaped the handler: ' + result.threw);
  assert.equal(result.stopped, 1,
    'an interim against a vanished field left the recognizer live — the pre-check is gone');
});

test('a resultIndex above an unchanged interim does not delete it', async (t) => {
  // The spec allows resultIndex > 0 with UNCHANGED interim results below it —
  // only entries at or above resultIndex changed. The strip removes the whole
  // previous injection, so the rebuild must scan EVERY non-final entry of
  // event.results; rebuilding only from resultIndex strips "make the hero"
  // and re-injects just "blue" — dictated text deleted by the event that
  // did not change it (Sol #1, 2026-08-07). The fake's emit helpers are
  // full-snapshot at index 0, so the multi-result event is built by hand.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.onresult({
          resultIndex: 0,
          results: [
            { 0: { transcript: 'make' }, isFinal: false, length: 1 },
            { 0: { transcript: 'the hero' }, isFinal: false, length: 1 }
          ]
        });
        const first = root.querySelector('[data-instruction]').value;
        fake.onresult({
          resultIndex: 1,
          results: [
            { 0: { transcript: 'make' }, isFinal: false, length: 1 },
            { 0: { transcript: 'blue' }, isFinal: false, length: 1 }
          ]
        });
        const second = root.querySelector('[data-instruction]').value;
        return { first, second };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.first, 'make the hero', 'fixture check: the first event must inject both interim entries');
  assert.equal(result.second, 'make blue',
    'the unchanged interim below resultIndex was deleted by the event that did not change it: ' +
    JSON.stringify(result.second));
});

test('PINNED: a final resurrects an interim preview the user deleted — deletion does not unsay speech', async (t) => {
  // Deliberate semantics, not a defect (Kimi F6 / Sol #3 disposition,
  // 2026-08-07): the user deleted the PREVIEW, but the words were spoken and
  // the final is the recognizer's only report of them — dropping it would
  // LOSE dictated audio with no way back, while resurrecting leaves extra
  // text one deletion away. String equality is a heuristic, not provenance;
  // both of its misreads leave EXTRA dictated text the user can delete,
  // never lost user text that DIFFERS from the injected chunk. If this test
  // goes red because the final is now suppressed, that is a semantics
  // CHANGE, not a fix — re-read the disposition first.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        fake.emitInterim('draft one');
        const field = root.querySelector('[data-instruction]');
        field.value = '';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        fake.emitFinal('draft one');
        return { value: root.querySelector('[data-instruction]').value };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.value, 'draft one',
    'the pinned resurrect semantics changed: ' + JSON.stringify(result.value));
});

test('the maxLength clamp never splits a surrogate pair', async (t) => {
  // A raw slice landing between the halves of a pair persists a lone high
  // surrogate, which every consumer renders as a replacement character
  // (Sol #4, 2026-08-07). 'abcdefghij 🙂' is 13 UTF-16 units; a cut at 12
  // lands exactly between the emoji's halves, so the clamp must back off to
  // 11 — under-filling the cap by one beats shipping half an emoji.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const fake = window.__voiceFake.instances[0];
        const field = root.querySelector('[data-instruction]');
        field.maxLength = 12;
        fake.emitFinal('abcdefghij \\u{1F642}');
        return { value: root.querySelector('[data-instruction]').value };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(/[\uD800-\uDBFF]$/.test(result.value), false,
    'the clamp cut through a surrogate pair and shipped a lone high surrogate: ' + JSON.stringify(result.value));
  assert.equal(result.value, 'abcdefghij ',
    'the clamp must back off exactly one unit, not truncate further: ' + JSON.stringify(result.value));
});

test('a suspended AudioContext is resumed at grant time — the wave must not sit permanently flat', async (t) => {
  // The context is created inside the getUserMedia .then(), potentially long
  // after the mic click's transient activation, and Chrome can hand it back
  // 'suspended' — every later frame then reads a silent analyser and the
  // "voice attention system" shows nothing, forever, with dictation working
  // fine (Kimi F7, 2026-08-07). The fixture's fake context STARTS suspended,
  // so the overlay's resume() call is the only thing this can measure.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(`(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        window.__waveFake.grant();
        await new Promise((r) => setTimeout(r, 0));
        const ctx = window.__waveFake.contexts[0];
        const resumeCalls = ctx ? ctx.resumeCalls : 0;
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        return { contexts: window.__waveFake.contexts.length, resumeCalls };
      })()`);
    }, WAVE_HOST_PAGE);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.contexts, 1, 'fixture check: the grant never built an audio context');
  assert.ok(result.resumeCalls >= 1,
    'a suspended context was never resumed — the wave paints flat for the whole session');
});

test('stopping dictation releases the microphone AT STOP TIME, not when onend eventually arrives', async (t) => {
  // With the stopping-flag teardown (Kimi F2), the session clears in onend —
  // which on real Chrome arrives on a later task. If stopDictation itself
  // skipped stopVoiceWave, the fake's SYNCHRONOUS stop()->onend would tear
  // the wave down anyway and every teardown test would stay green while a
  // real user's recording indicator outlives their stop click by however
  // long Chrome takes to flush. The fake's stop is nooped so the assertion
  // reads the track state in the gap.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(`(async () => {
        const root = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
        const mic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        mic().click();
        window.__waveFake.grant();
        await new Promise((r) => setTimeout(r, 0));
        const fake = window.__voiceFake.instances[0];
        fake.stop = function () { this.stopped += 1; }; // onend arrives later on real Chrome
        mic().click(); // user stop — session is stopping, onend not yet delivered
        const stopsBeforeOnend = window.__waveFake.streams[0].tracks[0].stopCalls;
        fake.onend({});
        return { stopsBeforeOnend };
      })()`);
    }, WAVE_HOST_PAGE);
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.ok(result.stopsBeforeOnend >= 1,
    'the mic track was still recording between the user\'s stop click and onend — the wave teardown rode the fake\'s synchronous onend');
});

test('a panel rebuild that drops the dictation field ends the session during silence', async (t) => {
  // switchTab (and any other state change) rebuilds the panel DOM wholesale;
  // a tab-scoped field is simply absent from the fresh markup. onresult's
  // vanished-field guard only runs when the user SPEAKS, so a silent user
  // who tabs away would otherwise keep a hot microphone with its only off
  // switch — the mic beside the field — gone with the field (Sol round-3
  // P1, 2026-08-08). The guard is renderPanel's last statement, so the
  // property here is asserted with NO speech event at all: the tab click is
  // the only stimulus. data-template-name lives only in the Assets tab,
  // which is what makes the drop real — data-instruction cannot be used, it
  // rides in panel A's footer through every tab.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        const mic = root.querySelector('[data-voice-dictate="data-template-name"]');
        if (!mic) return { error: 'no template-name mic in the Assets tab' };
        mic.click();
        const fake = window.__voiceFake.instances[0];
        fake.stop = function () { this.stopped += 1; }; // real Chrome: onend arrives later
        const startedLive = fake.started;
        root.querySelector('[data-tab="layers"]').click();
        const fieldGone = !root.querySelector('[data-template-name]');
        return {
          startedLive,
          fieldGone,
          stopped: fake.stopped,
          instances: window.__voiceFake.instances.length
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.startedLive, 1, 'fixture check: dictation must be live before the tab switch');
  assert.equal(result.fieldGone, true,
    'fixture check: the tab switch must actually remove the field, or this test measures nothing');
  assert.equal(result.instances, 1, 'the tab switch must not mint a new recognizer');
  assert.equal(result.stopped, 1,
    'the rebuild dropped the dictation field and the recognizer was never stopped — a silent user keeps a hot mic with no off switch');
});

test('a different-target mic click parks the old session so its late flush still commits to its own field', async (t) => {
  // Real Chrome's stop() delivers one last final AFTER stop() returns.
  // Without the flushingDictation park, a target switch loses that flush
  // DETERMINISTICALLY: toggleDictation overwrites the session in the same
  // task, so the old recognizer's flush arrives to find the identity guard
  // pointing at the new session (Sol round-3 P2, 2026-08-08 — Sol traced
  // the stopping+second-click race; the live-session switch is the same
  // loss with no race needed). The fake's stop() fires onend synchronously
  // — the ordering that HIDES this — so the flush is replayed by hand, and
  // the pending interim proves the parked session's strip tracking
  // survived the park: the committed final must REPLACE it, not stack.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const first = window.__voiceFake.instances[0];
        first.stop = function () { this.stopped += 1; }; // real Chrome: onend arrives later
        first.emitInterim('make the');
        root.querySelector('[data-voice-dictate="data-template-name"]').click();
        const second = window.__voiceFake.instances[1];
        const secondLive = root.querySelector('[data-voice-dictate="data-template-name"]').getAttribute('aria-pressed');
        // The old recognizer's flush, arriving after the new session started:
        first.emitFinal('make the hero blue');
        const instructionValue = root.querySelector('[data-instruction]').value;
        const templateValue = root.querySelector('[data-template-name]').value;
        first.onend({}); // Chrome's real onend for the parked session, later still
        // onend released the park slot, so a replayed event from the dead
        // recognizer must commit NOTHING — the slot release is what makes a
        // parked session's lifetime end, and this is its only observable.
        first.emitFinal('and again');
        const instructionValueAfterOnend = root.querySelector('[data-instruction]').value;
        return {
          firstStopped: first.stopped,
          secondStarted: second ? second.started : 0,
          secondLive,
          instructionValue,
          templateValue,
          instructionValueAfterOnend,
          secondStillLive: root.querySelector('[data-voice-dictate="data-template-name"]').getAttribute('aria-pressed'),
          secondStopped: second ? second.stopped : -1
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.firstStopped, 1, 'fixture check: the target switch must stop the first recognizer');
  assert.equal(result.secondStarted, 1, 'fixture check: the target switch must start a second recognizer');
  assert.equal(result.secondLive, 'true', 'fixture check: the new session must be live before the flush arrives');
  assert.equal(result.instructionValue, 'make the hero blue',
    'the parked session\'s flush was dropped (or its interim stranded): ' + JSON.stringify(result.instructionValue) +
    ' — the last words spoken before a target switch vanish');
  assert.equal(result.templateValue, '',
    'the parked flush leaked into the NEW session\'s field');
  assert.equal(result.instructionValueAfterOnend, 'make the hero blue',
    'a replayed event from a recognizer whose onend already released the park slot still committed text');
  assert.equal(result.secondStopped, 0,
    'handling the parked flush must not stop the live session');
  assert.equal(result.secondStillLive, 'true',
    'the parked session\'s late onend killed the live session it no longer owns');
});

test('a parked session whose field vanished releases its slot without killing the live session', async (t) => {
  // The parked-session branch of onresult's vanished-field path: the parked
  // recognizer is already stopped, so releasing the slot is the whole
  // teardown — calling stopDictation() there would act on the LIVE session
  // instead, ending the dictation the user just started because the OLD
  // one's field went away with a tab switch. The append-failure early
  // return one block down shares the mechanism but has no reachable
  // trigger of its own (onresult's pre-check and appendDictatedText query
  // the same descriptor), so it is belt-and-braces and no test pretends to
  // kill it — this test covers the reachable clause.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        root.querySelector('[data-voice-dictate="data-template-name"]').click();
        const first = window.__voiceFake.instances[0];
        first.stop = function () { this.stopped += 1; }; // real Chrome: onend arrives later
        first.emitInterim('product page');
        // Different-target click parks the template session, starts a live one:
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const second = window.__voiceFake.instances[1];
        // The tab switch removes the PARKED session's field. The live
        // session's field (panel A footer) survives the rebuild, so the
        // renderPanel guard stays out of the way.
        root.querySelector('[data-tab="layers"]').click();
        const parkedFieldGone = !root.querySelector('[data-template-name]');
        // The parked recognizer's flush now finds no field:
        first.emitFinal('product page template');
        return {
          parkedFieldGone,
          secondStopped: second ? second.stopped : -1,
          secondLive: root.querySelector('[data-voice-dictate="data-instruction"]').getAttribute('aria-pressed'),
          instructionValue: root.querySelector('[data-instruction]').value
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.parkedFieldGone, true,
    'fixture check: the tab switch must remove the parked session\'s field, or this test measures nothing');
  assert.equal(result.secondStopped, 0,
    'the parked session\'s dead-end flush stopped the LIVE session — the user\'s new dictation ended because the OLD field went away');
  assert.equal(result.secondLive, 'true', 'the live session must still read live on its mic');
  assert.equal(result.instructionValue, '',
    'the parked flush against a vanished field must commit nothing anywhere');
});

test('two parked flushes both survive a third-field switch — the park is a list, not a slot', async (t) => {
  // The one-slot flushingDictation park (this mechanism's first version)
  // dropped the OLDEST orphan on a second park: A->B parked A, B->C
  // overwrote the slot with B, and A's delayed final resolved to neither
  // live nor parked — the first utterance silently vanished (Sol round-4
  // P2, 2026-08-08; harm bounded, the recognizer was stopped, but the
  // user's words were lost). Both parked recognizers here withhold onend
  // (real Chrome delivers the flush and onend LATER), so TWO parks are in
  // flight when the third session starts; each flush must still commit to
  // its OWN field, and each entry must release on its own onend.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        root.querySelector('[data-voice-dictate="data-instruction"]').click();
        const first = window.__voiceFake.instances[0];
        first.stop = function () { this.stopped += 1; }; // real Chrome: onend arrives later
        first.emitInterim('make the');
        root.querySelector('[data-voice-dictate="data-template-name"]').click();
        const second = window.__voiceFake.instances[1];
        second.stop = function () { this.stopped += 1; };
        second.emitInterim('product');
        const opener = root.querySelector('[data-settings-open]');
        if (!opener) return { error: 'no settings-open trigger in the overlay' };
        opener.click();
        const modal = root.querySelector('.raven-grab-settings-modal') ||
          Array.from(root.children).find((el) => el.querySelector && el.querySelector('[data-feedback-message]'));
        const mic = modal ? modal.querySelector('[data-voice-dictate="data-feedback-message"]') : null;
        if (!mic) return { error: 'no feedback mic in the settings modal' };
        mic.click();
        const third = window.__voiceFake.instances[2];
        // Two parks in flight. The OLDEST flush arrives first:
        first.emitFinal('make the hero blue');
        second.emitFinal('product page');
        const instructionValue = root.querySelector('[data-instruction]').value;
        const templateValue = root.querySelector('[data-template-name]').value;
        first.onend({});
        second.onend({});
        // Both entries released — replayed events from dead recognizers
        // must commit nothing:
        first.emitFinal('and again');
        second.emitFinal('and more');
        return {
          firstStopped: first.stopped,
          secondStopped: second.stopped,
          thirdStarted: third ? third.started : 0,
          thirdStopped: third ? third.stopped : -1,
          instructionValue,
          templateValue,
          instructionAfterOnend: root.querySelector('[data-instruction]').value,
          templateAfterOnend: root.querySelector('[data-template-name]').value,
          thirdLive: mic.getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.firstStopped, 1, 'fixture check: the first switch must stop recognizer A');
  assert.equal(result.secondStopped, 1, 'fixture check: the second switch must stop recognizer B');
  assert.equal(result.thirdStarted, 1, 'fixture check: the third mic must start recognizer C');
  assert.equal(result.instructionValue, 'make the hero blue',
    'the OLDEST parked flush was dropped: a one-slot park overwrites A\'s entry when B parks, and the first utterance vanishes');
  assert.equal(result.templateValue, 'product page',
    'the NEWER parked flush must commit to its own field too');
  assert.equal(result.instructionAfterOnend, 'make the hero blue',
    'a replayed event from a recognizer whose onend already released its entry still committed text');
  assert.equal(result.templateAfterOnend, 'product page',
    'a replayed event from a recognizer whose onend already released its entry still committed text');
  assert.equal(result.thirdStopped, 0,
    'handling the parked flushes must not stop the live third session');
  assert.equal(result.thirdLive, 'true',
    'the third session must still read live after both parked flushes commit');
});

test('a flood of parks with no onend is bounded — the oldest entry is evicted, the rest all commit', async (t) => {
  // A parked entry releases on its recognizer's onerror/onend — a SUCCESSFUL
  // flush deliberately retains it, because a stopped recognizer may deliver
  // more finals before onend. The cost: a recognizer whose onend never
  // arrives (the state stopDictation's hard-clear branch exists for) would
  // retain its entry FOREVER, and alternating mic clicks would grow the
  // list without bound (Sol round-5 P2, 2026-08-08). The push site now
  // evicts past MAX_PARKED_DICTATIONS (8), preferring an entry that has
  // already delivered a post-stop final; NO entry has flushed here, so the
  // fallback applies — the OLDEST overall. Nine parks are
  // created here — one past the cap — so exactly s0 is evicted: its late
  // final must commit NOTHING, while all EIGHT retained entries (the exact
  // boundary — this is also the test that catches a >= -> > flip and an
  // over-eager cap) commit to their own fields, and the live tenth session
  // stays untouched. The 9-park fixture is derived from the cap: if
  // MAX_PARKED_DICTATIONS changes, this test must change with it.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        const instrMic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        const tmplMic = () => root.querySelector('[data-voice-dictate="data-template-name"]');
        // Ten alternating different-target clicks: sessions s0..s9, each
        // click parking the previous session. Every recognizer withholds
        // onend (real Chrome: onend arrives later — here, never).
        for (let k = 0; k < 10; k += 1) {
          const mic = k % 2 === 0 ? instrMic() : tmplMic();
          if (!mic) return { error: 'mic ' + k + ' not found' };
          mic.click();
          const inst = window.__voiceFake.instances[k];
          if (!inst) return { error: 'mic click ' + k + ' started no recognizer' };
          inst.stop = function () { this.stopped += 1; };
        }
        const all = window.__voiceFake.instances;
        // Nine parks were pushed (s0..s8); the cap evicted only s0. Each
        // parked recognizer's delayed final arrives now, oldest first:
        for (let k = 0; k < 9; k += 1) all[k].emitFinal('park' + k);
        return {
          instances: all.length,
          parkedStops: all.slice(0, 9).map((r) => r.stopped),
          liveStopped: all[9].stopped,
          instructionValue: root.querySelector('[data-instruction]').value,
          templateValue: root.querySelector('[data-template-name]').value,
          liveMicPressed: tmplMic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.instances, 10, 'fixture check: ten mic clicks must start ten recognizers');
  assert.deepEqual(result.parkedStops, [1, 1, 1, 1, 1, 1, 1, 1, 1],
    'fixture check: every parked session\'s recognizer must have been stopped exactly once');
  assert.equal(result.instructionValue, 'park2 park4 park6 park8',
    'the evicted oldest entry\'s late final must commit nothing, and every retained even-indexed park must commit — got ' +
    JSON.stringify(result.instructionValue));
  assert.equal(result.templateValue, 'park1 park3 park5 park7',
    'every retained odd-indexed park must commit to its own field — got ' +
    JSON.stringify(result.templateValue));
  assert.equal(result.liveStopped, 0,
    'the parked flushes must not stop the live tenth session');
  assert.equal(result.liveMicPressed, 'true',
    'the live tenth session must still read live after the flood of parked flushes');
});

test('eviction prefers an already-flushed entry — an older unflushed park keeps its spoken text', async (t) => {
  // Sol round-6 P2 (2026-08-08): evicting the oldest entry UNCONDITIONALLY
  // is refutable — a valid interleaving leaves the oldest entry the only
  // recognizer still owed its FIRST final while a newer entry has already
  // flushed and is only awaiting onend. Eviction now prefers the oldest
  // entry marked flushedOnce (set when a parked entry delivers a post-stop
  // final) and takes the oldest overall only when none has flushed. Same
  // ten-click flood as the previous test, but s1's final arrives EARLY —
  // right after s1 is parked, before the cap is reached — so at eviction
  // time s1 is the one already-flushed entry and is evicted INSTEAD of the
  // older, still-unflushed s0. The discriminator is park0: under plain
  // oldest-eviction s0 dies and park0 commits nothing; here it must land.
  // s1's post-eviction final is a genuine FURTHER final (multiple post-stop
  // finals are the park list's own stated design), not a redispatch — its
  // discard is the accepted bounded loss of evicting a flushed entry,
  // pinned observable here so the trade is measured, not implied (Sol
  // round-7: this assertion PINS the loss class; it does not bless it).
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        const instrMic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        const tmplMic = () => root.querySelector('[data-voice-dictate="data-template-name"]');
        const clickMic = (k) => {
          const mic = k % 2 === 0 ? instrMic() : tmplMic();
          if (!mic) return 'mic ' + k + ' not found';
          mic.click();
          const inst = window.__voiceFake.instances[k];
          if (!inst) return 'mic click ' + k + ' started no recognizer';
          inst.stop = function () { this.stopped += 1; };
          return null;
        };
        // s0 live, then s1 (parks s0), then s2 (parks s1)…
        for (let k = 0; k < 3; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        // …s1's final arrives while parked: it commits AND marks the entry
        // flushed. Captured as a fixture precondition — a draft that never
        // landed this flush would pass against the defect.
        window.__voiceFake.instances[1].emitFinal('park1');
        const earlyTemplate = root.querySelector('[data-template-name]').value;
        for (let k = 3; k < 10; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        const all = window.__voiceFake.instances;
        // The tenth click evicted one entry: s1 (flushed), NOT s0 (oldest).
        // Late finals for everything else, oldest first; then a genuine
        // FURTHER final from evicted s1, which must find no owner — the
        // accepted loss.
        for (let k = 0; k < 9; k += 1) {
          if (k !== 1) all[k].emitFinal('park' + k);
        }
        all[1].emitFinal('park1-late');
        return {
          instances: all.length,
          earlyTemplate,
          parkedStops: all.slice(0, 9).map((r) => r.stopped),
          liveStopped: all[9].stopped,
          instructionValue: root.querySelector('[data-instruction]').value,
          templateValue: root.querySelector('[data-template-name]').value,
          liveMicPressed: tmplMic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.instances, 10, 'fixture check: ten mic clicks must start ten recognizers');
  assert.equal(result.earlyTemplate, 'park1',
    'fixture check: s1\'s early parked flush must have landed before the cap was reached');
  assert.deepEqual(result.parkedStops, [1, 1, 1, 1, 1, 1, 1, 1, 1],
    'fixture check: every parked session\'s recognizer must have been stopped exactly once');
  assert.equal(result.instructionValue, 'park0 park2 park4 park6 park8',
    'the unflushed oldest entry must be RETAINED — park0 committing is the discriminator against plain oldest-eviction — got ' +
    JSON.stringify(result.instructionValue));
  assert.equal(result.templateValue, 'park1 park3 park5 park7',
    'the flushed entry\'s early final stays, its post-eviction FURTHER final is discarded (the accepted, pinned loss), and the retained odd parks all commit — got ' +
    JSON.stringify(result.templateValue));
  assert.equal(result.liveStopped, 0,
    'the parked flushes must not stop the live tenth session');
  assert.equal(result.liveMicPressed, 'true',
    'the live tenth session must still read live');
});

test('a whitespace-only final does not mark a parked entry flushed — its real text is still coming', async (t) => {
  // Sol round-7 P2 (2026-08-08): appendDictatedText reports SUCCESS on a
  // whitespace-only final without committing anything (its own trim guard),
  // so a flushedOnce mark keyed on the RAW string's truthiness marks an
  // entry that committed nothing — and the eviction then preferentially
  // discards the one entry whose substantive final is still coming. Same
  // ten-click flood, but s1's early final is PURE WHITESPACE: under the
  // fixed /\S/ mark nothing is flushed at eviction time, so the fallback
  // evicts the oldest overall (s0) and s1's later substantive final
  // commits; under the raw-truthiness mark s1 is evicted and 'park1' dies
  // while s0's park0 commits. Both fields flip — the double discriminator.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        const instrMic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        const tmplMic = () => root.querySelector('[data-voice-dictate="data-template-name"]');
        const clickMic = (k) => {
          const mic = k % 2 === 0 ? instrMic() : tmplMic();
          if (!mic) return 'mic ' + k + ' not found';
          mic.click();
          const inst = window.__voiceFake.instances[k];
          if (!inst) return 'mic click ' + k + ' started no recognizer';
          inst.stop = function () { this.stopped += 1; };
          return null;
        };
        for (let k = 0; k < 3; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        // s1's parked "final" is noise: spaces and a tab. appendDictatedText
        // succeeds without committing — the field must stay empty (asserted
        // as the fixture precondition: an accidentally-substantive string
        // here would mark legitimately and measure nothing).
        window.__voiceFake.instances[1].emitFinal('  \\t ');
        const earlyTemplate = root.querySelector('[data-template-name]').value;
        for (let k = 3; k < 10; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        const all = window.__voiceFake.instances;
        // Nothing was genuinely flushed when the cap hit, so the fallback
        // must have evicted s0 (oldest overall) — s1 stays parked and its
        // substantive final lands now, along with everyone else's:
        for (let k = 0; k < 9; k += 1) all[k].emitFinal('park' + k);
        return {
          instances: all.length,
          earlyTemplate,
          parkedStops: all.slice(0, 9).map((r) => r.stopped),
          liveStopped: all[9].stopped,
          instructionValue: root.querySelector('[data-instruction]').value,
          templateValue: root.querySelector('[data-template-name]').value,
          liveMicPressed: tmplMic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.instances, 10, 'fixture check: ten mic clicks must start ten recognizers');
  assert.equal(result.earlyTemplate, '',
    'fixture check: the whitespace-only final must have committed nothing — a substantive string here would mark legitimately and measure nothing');
  assert.deepEqual(result.parkedStops, [1, 1, 1, 1, 1, 1, 1, 1, 1],
    'fixture check: every parked session\'s recognizer must have been stopped exactly once');
  assert.equal(result.instructionValue, 'park2 park4 park6 park8',
    'with nothing genuinely flushed, the fallback must evict the oldest overall (s0) — park0 committing means the whitespace final was wrongly counted as a flush — got ' +
    JSON.stringify(result.instructionValue));
  assert.equal(result.templateValue, 'park1 park3 park5 park7',
    'the whitespace-marked entry must be RETAINED so its substantive final commits — park1 missing means it was preferentially evicted over an unflushed older entry — got ' +
    JSON.stringify(result.templateValue));
  assert.equal(result.liveStopped, 0,
    'the parked flushes must not stop the live tenth session');
  assert.equal(result.liveMicPressed, 'true',
    'the live tenth session must still read live');
});

test('a final clamped away by a full field does not mark the entry — the field can shrink and its text still land', async (t) => {
  // Sol round-8 P2 (2026-08-08): the round-7 comment ACCEPTED the full-field
  // clamp case as a residual on the claim that later finals were "equally
  // unclampable" — false, because capped fields stay user-editable and every
  // append clamps against the field's CURRENT value. The loss path: a
  // substantive final against a full field commits nothing, the /\S/ mark
  // fires anyway, the user SHRINKS the field, capacity eviction prefers the
  // marked entry, and its later final — which now FITS — is discarded. The
  // mark is now a non-whitespace field DELTA across the append. This fixture
  // is the sharpest cut of that defect: the template field is capped with
  // exactly ONE char of room, so s1's early substantive final commits ONLY
  // the separator space — the field CHANGES but gains no text. That one
  // fixture discriminates the fixed mark from BOTH wrong forms at once:
  // /\S/.test(finals) is true (the round-8 defect marks) and the field
  // value changed (a bare before/after delta marks too); only the
  // non-whitespace comparison declines. Then the user-shrink → flood →
  // eviction → further-final sequence Sol demanded, with the same double
  // discriminator as the two tests above: under any wrong mark s1 is
  // evicted and BOTH fields flip.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        const instrMic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        const tmplMic = () => root.querySelector('[data-voice-dictate="data-template-name"]');
        const tmplField = () => root.querySelector('[data-template-name]');
        const clickMic = (k) => {
          const mic = k % 2 === 0 ? instrMic() : tmplMic();
          if (!mic) return 'mic ' + k + ' not found';
          mic.click();
          const inst = window.__voiceFake.instances[k];
          if (!inst) return 'mic click ' + k + ' started no recognizer';
          inst.stop = function () { this.stopped += 1; };
          return null;
        };
        for (let k = 0; k < 3; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        // Cap the template field with exactly one char of room: existing
        // 'full' (4) under maxLength 5 leaves space for the separator and
        // nothing else. Set HERE, after the clicks — a mic click rebuilds
        // the panel and the recreated field carries its draft value and no
        // node-level maxLength, so a fixture set any earlier is silently
        // erased (measured: the first draft set it before the clicks and
        // read back 'park1x', uncapped and unfilled). The input dispatch
        // mirrors 'full' into the draft so a later rebuild cannot drop it;
        // maxLength constrains TYPING, not assignment, so value-then-cap
        // ordering is safe. Nothing rebuilds between here and the final.
        tmplField().value = 'full';
        tmplField().maxLength = 5;
        tmplField().dispatchEvent(new Event('input', { bubbles: true }));
        // s1's parked final is SUBSTANTIVE but the field is full: the clamp
        // keeps 'full' plus the separator and drops every character of
        // 'park1x'. Captured as the fixture precondition — 'full ' proves
        // the append RAN and committed only the space; anything else means
        // the fixture never exercised the one-char-of-room edge.
        window.__voiceFake.instances[1].emitFinal('park1x');
        const earlyTemplate = tmplField().value;
        // The user shrinks the field — the state change the round-7 comment
        // claimed could not matter. The cap raise alongside it is fixture
        // convenience only (so every retained park can commit and the
        // expected values stay exact): the mark decision under test has
        // already happened, against the capped, full field.
        tmplField().value = '';
        tmplField().maxLength = 200;
        tmplField().dispatchEvent(new Event('input', { bubbles: true }));
        for (let k = 3; k < 10; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        const all = window.__voiceFake.instances;
        // Nothing genuinely flushed when the cap hit — s1's separator-only
        // commit must not count — so the fallback evicted s0 (oldest
        // overall). s1 stays parked and its substantive final lands NOW,
        // into the shrunken field, along with everyone else's:
        for (let k = 0; k < 9; k += 1) all[k].emitFinal('park' + k);
        return {
          instances: all.length,
          earlyTemplate,
          parkedStops: all.slice(0, 9).map((r) => r.stopped),
          liveStopped: all[9].stopped,
          instructionValue: root.querySelector('[data-instruction]').value,
          templateValue: tmplField().value,
          liveMicPressed: tmplMic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.instances, 10, 'fixture check: ten mic clicks must start ten recognizers');
  assert.equal(result.earlyTemplate, 'full ',
    'fixture check: the clamped final must have committed exactly the separator space and none of its text — anything else and the one-char-of-room edge was never exercised');
  assert.deepEqual(result.parkedStops, [1, 1, 1, 1, 1, 1, 1, 1, 1],
    'fixture check: every parked session\'s recognizer must have been stopped exactly once');
  assert.equal(result.instructionValue, 'park2 park4 park6 park8',
    'with nothing genuinely flushed, the fallback must evict the oldest overall (s0) — park0 committing means the clamped-away final was wrongly counted as a flush — got ' +
    JSON.stringify(result.instructionValue));
  assert.equal(result.templateValue, 'park1 park3 park5 park7',
    'the clamped entry must be RETAINED so its text lands once the field has room — park1 missing means the no-commit mark made it the preferred eviction victim — got ' +
    JSON.stringify(result.templateValue));
  assert.equal(result.liveStopped, 0,
    'the parked flushes must not stop the live tenth session');
  assert.equal(result.liveMicPressed, 'true',
    'the live tenth session must still read live');
});

test('an invisible-only final neither writes nor marks — zero-width noise is not delivery', async (t) => {
  // Sol round-9 P2 (2026-08-08): JavaScript \s does not match the zero-width
  // format characters — U+200B ZERO WIDTH SPACE and U+2060 WORD JOINER pass
  // both of the append's \s passes — so an invisible-only final used to
  // append unseeable junk to the field AND mark the parked entry flushed:
  // the same eviction loss path as the whitespace and clamp tests above,
  // one character class over. The append now declines a final carrying no
  // VISIBLE content (dictatedVisibleContent), the established
  // whitespace-only semantic. Same ten-click flood as the whitespace test:
  // s1's early final is PURE zero-width, the field must stay empty — that
  // precondition is the assertion that kills the gate-removal mutant —
  // nothing is marked, so eviction takes the oldest overall (s0) and s1's
  // later substantive final lands. The invisible pair is built with
  // String.fromCharCode and self-asserted by char code: a literal
  // zero-width character is invisible to review and one editor pass from
  // silent deletion, at which point this test would measure an empty
  // string and nothing else.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        const instrMic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        const tmplMic = () => root.querySelector('[data-voice-dictate="data-template-name"]');
        const clickMic = (k) => {
          const mic = k % 2 === 0 ? instrMic() : tmplMic();
          if (!mic) return 'mic ' + k + ' not found';
          mic.click();
          const inst = window.__voiceFake.instances[k];
          if (!inst) return 'mic click ' + k + ' started no recognizer';
          inst.stop = function () { this.stopped += 1; };
          return null;
        };
        for (let k = 0; k < 3; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        // s1's parked "final" is invisible noise: ZWSP + WORD JOINER, plus —
        // per Sol round-10, which caught the class stopping short of the
        // full Default_Ignorable set — VARIATION SELECTOR-1 (U+FE00) and
        // LEFT-TO-RIGHT ISOLATE (U+2066), plus — per Sol round-11, which
        // caught the plane-14 lead surrogate written as \\uDB40 alone,
        // covering only the block's first quarter — U+E0400 as the pair
        // DB41 DC00. All five survive \\s normalization and trim, so only
        // the visible-content gate stands between them and the field;
        // FE00/2066 separate the complete-DI class from the round-9
        // approximation (mutant R5k), and E0400 separates the four-lead
        // range from the single-lead round-11 form (mutant R5l).
        const INVIS = String.fromCharCode(0x200B, 0x2060, 0xFE00, 0x2066, 0xDB41, 0xDC00);
        window.__voiceFake.instances[1].emitFinal(INVIS);
        const earlyTemplate = root.querySelector('[data-template-name]').value;
        for (let k = 3; k < 10; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        const all = window.__voiceFake.instances;
        // Nothing was genuinely flushed when the cap hit, so the fallback
        // must have evicted s0 (oldest overall) — s1 stays parked and its
        // substantive final lands now, along with everyone else's:
        for (let k = 0; k < 9; k += 1) all[k].emitFinal('park' + k);
        return {
          instances: all.length,
          earlyTemplate,
          // split('') iterates UTF-16 UNITS (Array.from would fuse the
          // DB41/DC00 pair into one code point and hide its trail):
          invisCodes: INVIS.split('').map((c) => c.charCodeAt(0).toString(16)).join(','),
          parkedStops: all.slice(0, 9).map((r) => r.stopped),
          liveStopped: all[9].stopped,
          instructionValue: root.querySelector('[data-instruction]').value,
          templateValue: root.querySelector('[data-template-name]').value,
          liveMicPressed: tmplMic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.instances, 10, 'fixture check: ten mic clicks must start ten recognizers');
  assert.equal(result.invisCodes, '200b,2060,fe00,2066,db41,dc00',
    'fixture self-check: the invisible run must actually be U+200B, U+2060, U+FE00, U+2066, then U+E0400 as the surrogate pair DB41 DC00 — anything else and this test is not exercising the default-ignorable class boundary it claims to');
  assert.equal(result.earlyTemplate, '',
    'the invisible-only final must have committed NOTHING — any write here means the visible-content gate is gone and unseeable junk reached the field — got codes ' +
    JSON.stringify(Array.from(result.earlyTemplate).map((c) => c.charCodeAt(0).toString(16))));
  assert.deepEqual(result.parkedStops, [1, 1, 1, 1, 1, 1, 1, 1, 1],
    'fixture check: every parked session\'s recognizer must have been stopped exactly once');
  assert.equal(result.instructionValue, 'park2 park4 park6 park8',
    'with nothing genuinely flushed, the fallback must evict the oldest overall (s0) — park0 committing means the invisible final was wrongly counted as a flush — got ' +
    JSON.stringify(result.instructionValue));
  assert.equal(result.templateValue, 'park1 park3 park5 park7',
    'the entry whose final was invisible noise must be RETAINED so its substantive final commits — park1 missing means it was preferentially evicted — got ' +
    JSON.stringify(result.templateValue));
  assert.equal(result.liveStopped, 0,
    'the parked flushes must not stop the live tenth session');
  assert.equal(result.liveMicPressed, 'true',
    'the live tenth session must still read live');
});

test('a clamp that retains only a zero-width character does not mark — an invisible delta is not delivery', async (t) => {
  // Sol round-9 P2 (2026-08-08), second half. The append's noise gate cannot
  // cover this one: the final CARRIES visible text (invisible leads +
  // 'park1x'), so it passes the gate — and the clamp then truncates every
  // visible character, keeping only the separator space and the leading
  // invisibles. Under the round-8 \s-only strip that delta read as delivery
  // ('full'+invisibles !== 'full') and marked the entry;
  // dictatedVisibleContent strips the default-ignorable class too, so both
  // sides compare 'full' and the mark declines. This is the ONLY test that separates the visibility
  // comparison from the \s-only one — the invisible-only test above never
  // changes the field at all, so both predicates agree there — which is why
  // the fixture leaves FOUR chars of room (maxLength 8): exactly the
  // separator plus the three invisible leads survive the cut. The leads
  // widened in round 10 — ZWSP alone would leave the class boundary
  // unmeasured here, since the round-9 class strips ZWSP too; U+FE00 and
  // U+2066 are what mutant R5k's narrowed class wrongly calls visible. Same
  // set-after-the-clicks fixture rules as the clamped-final test above.
  let result;
  try {
    result = await withOverlay(async (page) => {
      return page.evaluate(shadowEval(`
        root.querySelector('[data-tab="assets"]').click();
        const instrMic = () => root.querySelector('[data-voice-dictate="data-instruction"]');
        const tmplMic = () => root.querySelector('[data-voice-dictate="data-template-name"]');
        const tmplField = () => root.querySelector('[data-template-name]');
        const clickMic = (k) => {
          const mic = k % 2 === 0 ? instrMic() : tmplMic();
          if (!mic) return 'mic ' + k + ' not found';
          mic.click();
          const inst = window.__voiceFake.instances[k];
          if (!inst) return 'mic click ' + k + ' started no recognizer';
          inst.stop = function () { this.stopped += 1; };
          return null;
        };
        for (let k = 0; k < 3; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        // Four chars of room: existing 'full' (4) under maxLength 8 admits
        // the separator plus exactly three more characters — which will be
        // the final's three invisible leads (the cut character U+2066 is not
        // a high surrogate, so the clamp keeps all eight units). Set AFTER
        // the clicks (a mic click rebuilds the panel; the recreated field
        // carries its draft value and no node-level maxLength), input
        // dispatch mirrors the value into the draft; maxLength constrains
        // typing, not assignment.
        tmplField().value = 'full';
        tmplField().maxLength = 8;
        tmplField().dispatchEvent(new Event('input', { bubbles: true }));
        // s1's parked final: ZWSP + VARIATION SELECTOR-1 + LTR ISOLATE, then
        // substantive text. Passes the visible-content gate ('park1x' is
        // visible), clamps to 'full ' + the three invisibles — a field
        // change with no visible delta.
        const INVIS = String.fromCharCode(0x200B, 0xFE00, 0x2066);
        window.__voiceFake.instances[1].emitFinal(INVIS + 'park1x');
        const earlyTemplate = tmplField().value;
        // The user shrinks the field; the cap raise is fixture convenience
        // (the mark decision already happened against the capped field).
        tmplField().value = '';
        tmplField().maxLength = 200;
        tmplField().dispatchEvent(new Event('input', { bubbles: true }));
        for (let k = 3; k < 10; k += 1) {
          const err = clickMic(k);
          if (err) return { error: err };
        }
        const all = window.__voiceFake.instances;
        // Nothing genuinely flushed when the cap hit — s1's invisible-delta
        // commit must not count — so the fallback evicted s0 (oldest
        // overall). s1 stays parked and its substantive final lands NOW:
        for (let k = 0; k < 9; k += 1) all[k].emitFinal('park' + k);
        return {
          instances: all.length,
          earlyTemplate,
          earlyCodes: Array.from(earlyTemplate).map((c) => c.charCodeAt(0).toString(16)).join(','),
          parkedStops: all.slice(0, 9).map((r) => r.stopped),
          liveStopped: all[9].stopped,
          instructionValue: root.querySelector('[data-instruction]').value,
          templateValue: tmplField().value,
          liveMicPressed: tmplMic().getAttribute('aria-pressed')
        };
      `));
    });
  } catch (err) {
    if (skipIfNoBrowser(t, err)) return;
    throw err;
  }
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.instances, 10, 'fixture check: ten mic clicks must start ten recognizers');
  assert.equal(result.earlyCodes, '66,75,6c,6c,20,200b,fe00,2066',
    'fixture check: the clamp must have kept exactly "full", the separator, and the three invisible leads — anything else and the invisible-delta edge was never exercised — got ' +
    JSON.stringify(result.earlyCodes));
  assert.equal(result.earlyTemplate, 'full ' + String.fromCharCode(0x200B, 0xFE00, 0x2066),
    'fixture check: earlyTemplate must read full-space-ZWSP-VS1-LRI (redundant with the code list above, kept for a readable failure)');
  assert.deepEqual(result.parkedStops, [1, 1, 1, 1, 1, 1, 1, 1, 1],
    'fixture check: every parked session\'s recognizer must have been stopped exactly once');
  assert.equal(result.instructionValue, 'park2 park4 park6 park8',
    'with nothing genuinely flushed, the fallback must evict the oldest overall (s0) — park0 committing means the invisible delta was wrongly counted as a flush — got ' +
    JSON.stringify(result.instructionValue));
  assert.equal(result.templateValue, 'park1 park3 park5 park7',
    'the invisible-delta entry must be RETAINED so its text lands once the field has room — park1 missing means the zero-width delta made it the preferred eviction victim — got ' +
    JSON.stringify(result.templateValue));
  assert.equal(result.liveStopped, 0,
    'the parked flushes must not stop the live tenth session');
  assert.equal(result.liveMicPressed, 'true',
    'the live tenth session must still read live');
});
