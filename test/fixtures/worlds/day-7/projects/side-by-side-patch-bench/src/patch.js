let loops=0;
const P={tempo:100,cutoff:800,detune:8,wobble:4,delay:0.3};
const defs=[["tempo",60,180,1],["cutoff",100,4000,10],["detune",0,40,1],["wobble",0,12,0.1],["delay",0,0.8,0.01]];
const code=document.getElementById("code");
function show(){const v=k=>"<b>"+P[k]+"</b>";
code.innerHTML=`const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "fatsawtooth",
                spread: ${v("detune")} }
});
const filter = new Tone.Filter(${v("cutoff")}, "lowpass");
const lfo = new Tone.LFO(${v("wobble")}, 200, ${v("cutoff")});
lfo.connect(filter.frequency);
const echo = new Tone.FeedbackDelay(
  "8n", ${v("delay")});
synth.chain(filter, echo, Tone.Destination);

Tone.Transport.bpm.value = ${v("tempo")};
// plays Am, F, C, G forever.
// loops so far: <b id="lc">${loops}</b>`;}
show();
let synth,filter,lfo,echo,started=false,an;
const sl=document.getElementById("sl");
defs.forEach(([k,a,b,s])=>{const d=document.createElement("div");d.className="r";
d.innerHTML=`<label>${k}</label><input type=range min=${a} max=${b} step=${s} value=${P[k]}>`;
d.querySelector("input").oninput=e=>{P[k]=+e.target.value;apply();show();};sl.appendChild(d);});
function apply(){if(!started)return;
synth.set({oscillator:{spread:P.detune}});
filter.frequency.value=P.cutoff;lfo.frequency.value=P.wobble;lfo.min=Math.max(50,P.cutoff*0.3);lfo.max=P.cutoff;
echo.feedback.value=P.delay;Tone.Transport.bpm.value=P.tempo;}
document.getElementById("go").onclick=async()=>{
if(started)return;await Tone.start();started=true;
synth=new Tone.PolySynth(Tone.Synth,{oscillator:{type:"fatsawtooth",count:3,spread:P.detune}});
synth.volume.value=-14;
filter=new Tone.Filter(P.cutoff,"lowpass");lfo=new Tone.LFO(P.wobble,200,P.cutoff).start();lfo.connect(filter.frequency);
echo=new Tone.FeedbackDelay("8n",P.delay);an=new Tone.Analyser("waveform",256);
synth.chain(filter,echo,an,Tone.Destination);
const ch=[["A3","C4","E4"],["F3","A3","C4"],["C3","E4","G4"],["G3","B3","D4"]];let i=0;
new Tone.Loop(t=>{synth.triggerAttackRelease(ch[i%4],"2n",t);i++;if(i%4==0){loops++;const e=document.getElementById("lc");if(e)e.textContent=loops;}},"2n").start(0);
apply();Tone.Transport.start();draw();
document.getElementById("go").textContent="Playing";};
const cv=document.getElementById("cv"),c=cv.getContext("2d");
function draw(){requestAnimationFrame(draw);const w=an.getValue();c.fillStyle="#000";c.fillRect(0,0,400,80);
c.strokeStyle="#ffcf5a";c.beginPath();w.forEach((y,i)=>c.lineTo(i*400/w.length,40+y*38));c.stroke();}
