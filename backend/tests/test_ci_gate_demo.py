"""TEMPORARY - deliberately failing test to demonstrate the CI quality gate (rubric M5).

Pushing this must turn the pipeline red and skip the image build/publish job.
The commit that adds this file is reverted straight after the red run is captured.
"""


def test_ci_gate_blocks_broken_code():
    assert 1 + 1 == 3, "Deliberate failure: the pipeline must stop here and publish no image."
