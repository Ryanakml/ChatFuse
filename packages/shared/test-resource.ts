import { resourceFromAttributes } from '@opentelemetry/resources';
const r = resourceFromAttributes({ 'service.name': 'test' });
console.log(r);
