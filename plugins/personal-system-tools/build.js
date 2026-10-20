"use strict";
const fs=require("node:fs"),path=require("node:path");
let main=fs.readFileSync(path.join(__dirname,"src/main.js"),"utf8");
for(const [name,file] of [["L","logic"],["UI","ui"]]) {
  const wrapped="const "+name+"=(()=>{const module={exports:{}};\n"+fs.readFileSync(path.join(__dirname,"src",file+".js"),"utf8")+"\nreturn module.exports;})();";
  main=main.replace('const '+name+'=require("./'+file+'");',()=>wrapped);
}
fs.writeFileSync(path.join(__dirname,"plugin/main.js"),main);
console.log("Built personal-system-tools/plugin/main.js");
