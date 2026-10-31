// Presence and compatibility only. Never print any part of a secret.
const raw=process.env.ASAAS_API_KEY||'',key=raw.startsWith('$$aact_')?raw.slice(1):raw,env=process.env.ASAAS_ENV||'production';
const environmentValid=['production','sandbox'].includes(env),matches=!key?null:!(key.includes('$aact_prod_')&&env!=='production')&&!(key.includes('$aact_hmlg_')&&env!=='sandbox');
console.log(JSON.stringify({environment:environmentValid?env:'inválido',apiKeyPresent:Boolean(raw),webhookTokenPresent:Boolean(process.env.ASAAS_WEBHOOK_TOKEN),keyEnvironmentMatches:matches,composeEscapingDetected:raw.startsWith('$$aact_')},null,2));
