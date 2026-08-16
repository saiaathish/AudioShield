# AudioSep-hive rescue lane

Evidence-only tooling for the pinned AudioSep-hive offline oracle. The lane does not wire the extension or bundle model weights.

The reproducible post-processing command is:

```sh
/tmp/audiosep-hive-venv/bin/python rescue/audiosep-hive/benchmark.py \
  --speech evidence/semantic-hearing/fixture/speech.wav \
  --dishes evidence/semantic-hearing/fixture/dishes.wav \
  --mixture evidence/semantic-hearing/fixture/mixture.wav \
  --target evidence/audiosep-hive/output/target-dishes.wav \
  --output-dir evidence/audiosep-hive/output
```

The target WAV was generated from `AlayaLab/Hive@f41b507d6be616ba864a5cd538b071338b6bd90d` using the `AlayaLab/AudioSep-hive@113d2e4399a4f19b6a0d567bbde38f2fe1b11794` checkpoint and the query `dishes clattering`. The large model files live outside the repository under `/tmp/audiosep-hive-cache`.

See [`evidence/audiosep-hive/latest.md`](../../evidence/audiosep-hive/latest.md) and [`metrics.json`](../../evidence/audiosep-hive/metrics.json) for license, checksum, runtime, and measured limits.
