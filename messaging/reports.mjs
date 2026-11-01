const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export function previousMonth(day){const d=new Date(day.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);}
export function endOfMonth(p){return p+'-'+new Date(Date.UTC(Number(p.slice(0,4)),Number(p.slice(5,7)),0)).getUTCDate();}
export async function familyReport(db,fid,p){
 const from=p+'-01',to=endOfMonth(p),family=await db.one('SELECT name FROM families WHERE id=?',fid);
 const rows=await db.all("SELECT c.*,CASE WHEN c.scope='club' THEN 'Família' WHEN a.entry_id IS NOT NULL AND a.participant_id IS NULL AND a.user_id IS NULL THEN 'Família' ELSE COALESCE(p.name,u.name,author.name,'Família') END person FROM cash_entries c LEFT JOIN cash_attributions a ON a.entry_id=c.id LEFT JOIN participants p ON p.id=a.participant_id LEFT JOIN users u ON u.id=a.user_id LEFT JOIN users author ON author.id=c.created_by WHERE c.family_id=? AND c.voided_at IS NULL AND c.entry_date>=? AND c.entry_date<=? AND (c.scope='family' OR (c.scope='club' AND c.kind='income')) ORDER BY c.id",fid,from,to);
 let income=0,expenses=0,club=0,sales=0;const people=new Map();
 for(const r of rows){const cost=r.scope==='club'||r.kind==='expense';if(cost)expenses+=r.cents;else income+=r.cents;if(r.scope==='club')club+=r.cents;if(r.scope==='family'&&r.kind==='income'&&r.category==='sales')sales+=r.cents;const person=people.get(r.person)||{income:0,expenses:0};person[cost?'expenses':'income']+=r.cents;people.set(r.person,person);}
 const projects=await db.all('SELECT status,COUNT(*) n FROM projects WHERE family_id=? AND created>=? AND created<? GROUP BY status',fid,from,to+'T23:59:59.999Z');
 const total=projects.reduce((n,r)=>n+Number(r.n),0),done=projects.filter(r=>['ready','completed'].includes(r.status)).reduce((n,r)=>n+Number(r.n),0);
 const lines=[`Olá! Resumo de ${p.slice(5,7)}/${p.slice(0,4)} — ${family.name}.`,`Receitas registradas: ${money(income)} (vendas: ${money(sales)}).`,`Despesas registradas: ${money(expenses)}.`,`Pagamentos ao clube: ${money(club)} (já incluídos nas despesas).`,`Resultado do mês: ${money(income-expenses)}.`,`Projetos criados no mês: ${total}; atualmente prontos/concluídos: ${done}.`];
 if(people.size){lines.push('Por participante / família:');for(const [name,v]of people)lines.push(`${name}: receitas ${money(v.income)}, despesas ${money(v.expenses)}, resultado ${money(v.income-v.expenses)}.`);}
 lines.push('Vamos aprender: resultado = receitas − despesas. Ele considera todos os registros, inclusive mesadas e presentes; não representa necessariamente o lucro das vendas. Custos que não foram lançados não entram nesta conta.','Conversem em família: qual despesa podemos planejar melhor no próximo mês?','Equipe Financeiro');
 return {text:lines.join('\n'),income,expenses,club,sales,result:income-expenses};
}
