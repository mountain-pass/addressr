// ADR-033 item 5, second component: the per-request SigV4 signing cost the
// shadow adds on top of mirror dispatch. Measured independently because the
// two costs are additive and the dispatch leg is measurable without AWS.
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';

const creds = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};
const { buildSignedRequestObject } = AwsSigv4Signer({
  region: 'ap-southeast-2',
  service: 'es',
  getCredentials: async () => creds,
});

// Representative of what mirrorRequest sends: a search body of the size the
// address query actually produces.
// DELIBERATELY NOT the production body, and must not be re-pointed at
// src/build-search-body.js. This measures SigV4 signing cost, which depends on
// payload SIZE, not semantics — the body is never executed. ADR-031's
// discharged primary-path invariant (0.010 ms/signature) was measured against
// this exact payload, so swapping it in re-bases a recorded, discharged number.
const body = JSON.stringify({
  from: 0,
  size: 8,
  query: {
    bool: {
      should: [
        {
          multi_match: {
            query: '55 pyrmont bridge rd pyrmont nsw 2009',
            type: 'bool_prefix',
            fields: ['sla', 'sla._2gram', 'sla._3gram'],
          },
        },
        {
          multi_match: {
            query: '55 pyrmont bridge rd pyrmont nsw 2009',
            type: 'phrase_prefix',
            fields: ['ssla', 'sla_range_expanded'],
          },
        },
      ],
    },
  },
  sort: ['_score', { confidence: 'desc' }, { 'ssla.raw': 'asc' }],
});

const make = () => ({
  method: 'POST',
  protocol: 'https:',
  hostname: 'search-example.ap-southeast-2.es.amazonaws.com',
  port: 443,
  path: '/addressr/_search',
  body,
  headers: {
    'content-type': 'application/json',
    host: 'search-example.ap-southeast-2.es.amazonaws.com',
  },
});

const N = 20000;
for (let i = 0; i < 2000; i += 1) await buildSignedRequestObject(make()); // warm

const t = process.hrtime.bigint();
for (let i = 0; i < N; i += 1) await buildSignedRequestObject(make());
const totalMs = Number(process.hrtime.bigint() - t) / 1e6;
console.log(
  JSON.stringify({
    n: N,
    total_ms: +totalMs.toFixed(1),
    per_signature_ms: +(totalMs / N).toFixed(5),
  }),
);
