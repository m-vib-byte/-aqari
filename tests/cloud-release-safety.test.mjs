// Include the isolated safety scenarios in the standard *.test.mjs release suite.
// This is a local, mocked test entry point; it never connects to production.
await import('./cloud-sync-empty-upload.selftest.mjs');
await import('./acceptance-evidence-gate.selftest.mjs');
