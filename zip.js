// Small dependency-free ZIP writer. PNG files are already compressed.
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function header(size){const bytes=new Uint8Array(size);return{bytes,view:new DataView(bytes.buffer)};}
export function makeZip(files){
  const parts=[],directory=[];let offset=0,centralSize=0;
  for(const file of files){
    const name=new TextEncoder().encode(file.name),data=file.data,crc=crc32(data);
    const local=header(30),v=local.view;v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
    parts.push(local.bytes,name,data);
    const central=header(46),c=central.view;c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,0x21,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
    directory.push(central.bytes,name);centralSize+=46+name.length;offset+=30+name.length+data.length;
  }
  const end=header(22),e=end.view;e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end.bytes],{type:'application/zip'});
}
