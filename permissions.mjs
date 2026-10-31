export const isAdmin=u=>u?.role==='admin'||u?.team_role==='admin';
export const isTeam=u=>isAdmin(u)||Boolean(u?.is_staff);
export const canFinance=u=>isAdmin(u)||(Boolean(u?.is_staff)&&u?.team_role==='finance');
export const canOperate=u=>isAdmin(u)||(Boolean(u?.is_staff)&&(!u?.team_role||u.team_role==='operator'));
