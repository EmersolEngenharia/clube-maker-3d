import json,subprocess,base64,re
B='<break time="%.1fs" />'
L=[
 "Imagine. Crie. Imprima!",
 "Pedir uma peça no Clube meiquer três dê é muito fácil. "+B%1.0+" São quatro passos. "+B%0.9,
 "Passo um: escolha como começar.",
 "Se você só tem uma ideia, a equipe ajuda a descobrir como fazer.",
 "Se já tem o modelo pronto, envie o arquivo, em ésse tê éle, ou três éme éfe.",
 "Se achou uma peça na internet, cole o link do site.",
 "Escolheu? Agora é só clicar em continuar.",
 "Passo dois: dê um nome ao projeto e conte a sua ideia.",
 "Se tiver o arquivo, é só enviar.",
 "Se for um link, cole o endereço da peça e busque os dados.",
 "Passo três: escolha o tamanho, a cor e a quantidade. Na dúvida, é só pedir ajuda.",
 "Passo quatro: revise tudo com calma.",
 "Depois, clique em enviar. "+B%1.2+" Nada é cobrado agora.",
 "A equipe avalia. "+B%1.0+" Prepara o orçamento. "+B%1.0+" Você aprova. "+B%1.0+" E a sua peça é impressa!",
 "Clube meiquer três dê. "+B%1.3+" Imagine. "+B%1.0+" Crie. "+B%1.0+" Imprima!"
]
json.dump(L,open('script_v3.json','w'),ensure_ascii=False,indent=1)
text=(' '+B%0.7+' ').join(L)
body=json.dumps({"text":text,"model_id":"eleven_multilingual_v2","language_code":"pt","voice_settings":{"stability":0.65,"similarity_boost":0.85,"style":0.1,"use_speaker_boost":True,"speed":0.98}})
r=subprocess.run(['curl','-sS','-o','v3/resp.json','-w','%{http_code}','-X','POST','https://api.elevenlabs.io/v1/text-to-speech/YklVF5l1Q8os8glyd5SM/with-timestamps?output_format=mp3_44100_128','-H','xi-api-key: proxy-injected','-H','Content-Type: application/json','-d',body],capture_output=True,text=True)
print(r.stdout)
d=json.load(open('v3/resp.json'))
open('v3/narracao.mp3','wb').write(base64.b64decode(d['audio_base64']))
a=d['alignment'];ch=a['characters'];st=a['character_start_times_seconds'];en=a['character_end_times_seconds']
s=''.join(ch);pos=0;res=[]
for i,t in enumerate(L):
    plain=re.sub(r'<break[^>]*/>','',t).strip()
    k=s.find(plain[:12],pos)
    assert k>=0,(i,plain)
    e=s.find(plain[-8:],k)+len(plain[-8:])-1
    res.append((st[k],en[min(e,len(en)-1)]));pos=e
chips=[];p=s.find('A equipe avalia',0)
for key in['A equipe avalia','Prepara o or','Você aprova','E a sua pe']:
    k=s.find(key,res[13][0]-.01 and 0);k=s.find(key,[i for i in range(len(s)) if i>=0][0])
    chips.append(st[s.rfind(key)])
fin=[st[s.rfind(w)] for w in['Imagine.','Crie.','Imprima!']]
json.dump({'beats':res,'chips':chips,'fin':fin},open('v3/beats.json','w'))
print([(round(a,2),round(b,2)) for a,b in res]);print('chips',chips,'fin',fin,'fim',en[-1])
