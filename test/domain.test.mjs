import test from 'node:test';
import assert from 'node:assert/strict';
import {period,allocation,settle,balance} from '../domain.mjs';
test('períodos usam Brasília, inclusive na virada do mês',()=>{assert.equal(period(new Date('2026-11-01T02:59:59Z')),'2026-10');assert.equal(period(new Date('2026-11-01T03:00:00Z')),'2026-11');});
test('franquia não fica negativa e excedente é proporcional',()=>{assert.deepEqual(allocation(125,100,600),{included:100,extra:25,extraCost:250});assert.deepEqual(allocation(60,-10,600),{included:0,extra:60,extraCost:600});});
test('consumo real menor reduz horas e material; excedentes nunca aumentam cobrança',()=>{const p={minutes:120,included:90,grams:100,extra_rate:600,material_rate:12000};assert.deepEqual(settle(p,80,50),{used:80,charge:600});assert.deepEqual(settle(p,200,200),{used:90,charge:1500});assert.deepEqual(settle(p,100,100),{used:90,charge:1300});});
test('reservas ficam no mês de origem e falhas/cancelamentos não consomem saldo',()=>{const ps=[{status:'queued',period:'2026-10',included:100},{status:'ready',period:'2026-10',used:80},{status:'failed',period:'2026-10',used:50,included:50},{status:'cancelled',period:'2026-10',included:50}];assert.deepEqual(balance(ps,720,'2026-10'),{allowance:720,used:80,held:100,available:540,period:'2026-10'});assert.equal(balance(ps,720,'2026-11').available,720);});
