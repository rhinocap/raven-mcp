# Run manifest — gpt-5.6-sol-vanilla (2026-07-19)

Exact command per case (serial, one call per case):
```
codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium --skip-git-repo-check "$PROMPT"
```

## Verbatim prompt template — HTML cases (24)
```
You are a design/accessibility reviewer. Below is the full HTML source of a single web page, rendered at viewport 390x844 (mobile). Review it for concrete design and accessibility defects: color contrast, tap target size, responsive visibility (content hidden at this viewport), typography, layout, and anything else actionable. Report each defect concretely with the element, the values involved, and why it fails. If the page has no actionable defects, say 'No actionable defects found.' Do not speculate beyond the source.

<contents of bench/corpus/<case-file>.html>
```

## Verbatim prompt template — taste content-port cases (3)
```
You are reviewing a content port. The source copy below was approved; the target is the ported version that shipped. Review the port: does the target preserve the source's exact wording and voice/register? Report any substitution, drift, or change concretely (quote the before/after words). If the port is faithful, say 'No defects found.'

SOURCE:
<contents of bench/corpus/<case>-source.txt>

TARGET:
<contents of bench/corpus/<case>-target.txt>
```

No other text was sent. The model was not given defect families, seeded-defect labels, expected answers, Raven tools, taste profiles, or DESIGN.md. Inputs are the committed corpus files themselves, so input equivalence is reproducible from this repo. Outputs below are preserved verbatim (codex session preamble stripped to the final assistant message; some outputs begin with the runner's own boilerplate preamble, which is part of the model's verbatim reply).

## Output hashes (sha256)
| file | sha256 |
|---|---|
| `contrast-boundary-clean.txt` | `95bba3a3b515e7efd35ad653002ab6465d1a5e3c295363459c8ad54de5ef85a1` |
| `contrast-boundary-fail.txt` | `1c867ab42553adc4ec23bcb8a5d86984c965a78e7f800f2387bd619998b4711b` |
| `contrast-clean.txt` | `929aba35ce53ae99845555376e6151a20d71006f4633bea21cb2c810218eb793` |
| `contrast-gradient-panel.txt` | `bf926e8b3c5021470ed2bd522033eb814f18e151c28aeb5ecf791f56fdd34f54` |
| `contrast-low-on-dark.txt` | `f263f5291f52ed011d645e8cb9a96c74f0da71a4fa427fc51acb865ee16d8ccc` |
| `contrast-low-on-light.txt` | `76a155d503beed4efad71932f7b05cb24aff6e574851bd3795ccc6018ee87543` |
| `responsive-clean.txt` | `2ea7cf76c4fe525acea067baf21a343fcd38a4bf2a4388b088156d9c3f6b9cea` |
| `responsive-hidden-caption.txt` | `216fee5acdd6469a1ba707e33fae7f8b8108772a32a23cf82494f4696950bacb` |
| `responsive-hidden-lede.txt` | `6c0b3a8bbd855405a136df3688b8baca3a8fa0e1b52186bd0fe41b9fbef8e11b` |
| `responsive-hidden-list-item.txt` | `040b4023f38ab4eace2623d30712c31445fc2f6395c2480a91ad2146bf0acea3` |
| `tap-boundary-clean.txt` | `734294c43df33c0369d624579be9bcbc278821f6fd39214dc77ef0cd6558e7a1` |
| `tap-boundary-fail.txt` | `1e4bd97ff50c1b0a641fbe9e19284bfee80a119fd8b95c2bc227f25e55db532e` |
| `tap-clean.txt` | `24e04019aa76c87aa534c5c55a27d2395461101214b172e2f820e47f59e17751` |
| `tap-short-link.txt` | `a99c409cfe2f7562ee18861dd26e05a3c734c7a9b4ce7e8085cba3ef9053a69d` |
| `tap-small-pair.txt` | `58d7797b17cfe34c6bc492f80bbbd0f8e62403ef076a2acae256fec34f6de52a` |
| `tap-tiny-button.txt` | `a4b89b2152e55ca3c4fd6176980441931349b727ab73bd24e1dec1ea6c7ab3e8` |
| `taste-proven-substitution.txt` | `f07cb19c4d09ff7fc6cf81e773f82943f717d27fc76f4ba5022713b2148de3aa` |
| `taste-unlock-substitution.txt` | `f9dce41aafa416f7869e6ef0ccafc1eec30bf431af96317a54483f47088ab69c` |
| `taste-verbatim-control.txt` | `9795194e78bd9cf23d4acfaf74f6d2fa7434b745f4bae8c55622e5f50253e719` |
| `type-clean.txt` | `24e04019aa76c87aa534c5c55a27d2395461101214b172e2f820e47f59e17751` |
| `type-line-height-boundary-clean.txt` | `24e04019aa76c87aa534c5c55a27d2395461101214b172e2f820e47f59e17751` |
| `type-line-height-boundary-fail.txt` | `dff6e7be79b247b15152e25908f2ec867bfead36df8b4fe42233dc6ab19af3aa` |
| `type-line-height-outlier.txt` | `7a2f00af440a99e71b3bb712d6a08386eeada904c3f5d7cf92a240753b6fc713` |
| `type-nonstandard-weight.txt` | `03b116fe7edbdadb645650938d93d896528996dafb9ef71fadeb1a6abbbaae51` |
| `type-too-many-weights.txt` | `2af81735e49a73904f9d8bd5a2e098fd2106c6a9c3568ff03fc57cbe2feb8b0f` |
| `type-weight-boundary-clean.txt` | `24e04019aa76c87aa534c5c55a27d2395461101214b172e2f820e47f59e17751` |
| `type-weight-boundary-fail.txt` | `f1f11478858f1c6985950f10db38bf33f39a22343151748dbb19e7df7ee3d4c5` |
