# Trilha instrumental sintetizada localmente (sem API): groove alegre 110 BPM, C–G–Am–F
import numpy as np,json,wave
sr=44100;T=json.load(open('timing.json'))['total']+1.0;n=int(sr*T)
bpm=110;beat=60/bpm;rng=np.random.default_rng(7)
L=np.zeros(n);R=np.zeros(n)
def add(sig,t0,pan=0.0,g=1.0):
    i=int(t0*sr);j=min(n,i+len(sig))
    if i>=n:return
    s=sig[:j-i]*g;L[i:j]+=s*(1-max(pan,0));R[i:j]+=s*(1+min(pan,0))
def env(l,a=.005,d=.2):
    t=np.arange(l)/sr;return np.minimum(t/a,1)*np.exp(-t/d)
def kick():
    l=int(.28*sr);t=np.arange(l)/sr;f=110*np.exp(-t*22)+45;ph=2*np.pi*np.cumsum(f)/sr;return np.sin(ph)*np.exp(-t*11)
def hat():
    l=int(.06*sr);x=rng.standard_normal(l);x=np.diff(x,prepend=0);return x*np.exp(-np.arange(l)/sr*70)*.4
def clap():
    l=int(.2*sr);x=rng.standard_normal(l);t=np.arange(l)/sr
    e=np.exp(-t*28)+.6*np.exp(-np.maximum(t-.012,0)*28)*(t>.012);return x*e*.5
def tone(f,l,kind='tri',d=.25,a=.004):
    t=np.arange(l)/sr
    if kind=='tri':w=2/np.pi*np.arcsin(np.sin(2*np.pi*f*t))
    elif kind=='saw':w=2*((f*t)%1)-1
    else:w=np.sin(2*np.pi*f*t)
    return w*env(l,a,d)
mid=lambda m:440*2**((m-69)/12)
chords=[[0,4,7],[7,11,14],[9,12,16],[5,9,12]];roots=[36,43,45,41]
bars=int(T/(beat*4))+1
for b in range(bars):
    c=b%4;t0=b*beat*4
    inten=0.5 if t0<5 else 1.0
    for k in range(4):
        tb=t0+k*beat
        add(kick(),tb,0,.9*inten)
        add(clap(),tb,0,.55*inten) if k in(1,3) and t0>=4 else None
        add(hat(),tb+beat/2,.2,.7*inten)
        if t0>=2.2:add(hat(),tb,-.2,.3)
    for e in range(8):  # baixo em colcheias
        te=t0+e*beat/2;m=roots[c]+(12 if e%4==3 else 0)
        add(tone(mid(m),int(.22*sr),'saw',.12),te,0,.22*inten)
    notes=chords[c]
    for e in range(16): # arpejo
        te=t0+e*beat/4;m=60+notes[[0,1,2,1][e%4]]+(12 if e%8>=4 else 0)
        add(tone(mid(m),int(.3*sr),'tri',.11),te,-.4 if e%2 else .4,.16*inten)
    for m in notes: # pad
        add(tone(mid(55+m),int(beat*4*sr),'sine',1.6,.25),t0,0,.07)
pk=max(np.abs(L).max(),np.abs(R).max());L/=pk;R/=pk
fade=np.ones(n);fi=int(.8*sr);fo=int(2.5*sr);fade[:fi]=np.linspace(0,1,fi);fade[-fo:]=np.linspace(1,0,fo)
st=np.stack([L*fade,R*fade],1);st=np.tanh(st*1.4)*.7
with wave.open('music.wav','wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((st*32767).astype('<i2').tobytes())
print('ok',round(T,1))
