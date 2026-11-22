import {cp,mkdir,readFile,writeFile,rename,rm,mkdtemp,readdir,lstat} from 'node:fs/promises'
import {dirname,join,resolve,isAbsolute,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'

// Builds a plugin for the official DSH runtime. Credentials and process
// lifetime belong to that runtime; this artifact contains no helper binary.
const destination=process.argv[2]
if(!destination||!isAbsolute(destination))throw new Error('Usage: node build-native.mjs /absolute/new/package')
try{await lstat(destination);throw new Error('Destination already exists')}catch(error){if(error.code!=='ENOENT')throw error}
const source=dirname(fileURLToPath(import.meta.url)),repository=resolve(source,'../..')
execFileSync(process.execPath,[join(source,'backend/build.mjs')],{stdio:'inherit'})
await mkdir(dirname(destination),{recursive:true})
const stage=await mkdtemp(join(dirname(destination),'.loop-native-'))
try{
  const files=['host.mjs','host-actions-core.mjs','host-service.mjs','host-worksite.mjs','worksite-origin.mjs','host-models.mjs','host-default-model.mjs','host-human-task.mjs','host-runtime.mjs','host-collaboration.mjs','collaboration-task-schema.mjs','host-collaboration-ui-journal.mjs','host-loop-skills.mjs','managed-skill.mjs','managed-config.mjs','managed-native-actions.mjs','model-identity.mjs','model-identity.d.mts','host-protocol.mjs','binding-store.mjs','remote.mjs','remote.d.ts','wire.mjs','private-path.mjs','private-path.ps1','client.js','client/index.d.ts','sync.mjs','backend/dist']
  for(const file of files){await mkdir(dirname(join(stage,file)),{recursive:true});await cp(join(source,file),join(stage,file),{recursive:true})}
  await cp(join(source,'README.native.md'),join(stage,'README.md'))
  await cp(join(repository,'plugins/loop-dsh/lib'),join(stage,'sync'),{recursive:true})
  await mkdir(join(stage,'skills'),{recursive:true})
  await cp(join(repository,'skills/loop-proxy-harness'),join(stage,'skills/loop-proxy-harness'),{recursive:true})
  const patch=await readFile(join(source,'cordis.managed.patch.yml'),'utf8')
  await writeFile(join(stage,'cordis.patch.yml'),patch)
  await writeFile(join(stage,'flavor'),'native\n')
  const pkg=JSON.parse(await readFile(join(source,'package.json'),'utf8'))
  delete pkg.devDependencies;delete pkg.scripts
  pkg.dependencies={koffi:pkg.dependencies.koffi,ws:pkg.dependencies.ws}
  pkg.files=[...await readdir(stage),"artifact.sha256"]
  await writeFile(join(stage,'package.json'),JSON.stringify(pkg,null,2)+'\n')
  const hashes=[]
  async function walk(directory){for(const item of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,item.name)
    if(item.isDirectory())await walk(path)
    else if(item.isFile())hashes.push(createHash('sha256').update(await readFile(path)).digest('hex')+'  '+relative(stage,path).replaceAll('\\','/'))
    else throw new Error('Release cannot contain symbolic links')
  }}
  await walk(stage);await writeFile(join(stage,'artifact.sha256'),hashes.sort().join('\n')+'\n')
  await rename(stage,destination)
  process.stdout.write(destination+'\n')
}finally{await rm(stage,{recursive:true,force:true})}
