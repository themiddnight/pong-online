# ข้อพิจารณาและมาตรฐานสู่ระดับ "เกมเอนจิ้นสากล" (Professional Game Engine Standards)

เอกสารฉบับนี้เป็นภาคเสริมเชิงวิเคราะห์เปรียบเทียบระหว่าง **"ระบบเบื้องต้นที่ออกแบบสำหรับโปรเจกต์ Pong 1v1"** กับ **"มาตรฐานของ Game Engine ระดับ E-Sports (AAA / IO Games)"**

วัตถุประสงค์หลักของเอกสารนี้คือการเป็น **Project Study** สำหรับทีมพัฒนาที่ต้องการก้าวข้ามขีดจำกัดของโปรโตคอลเว็บพื้นฐาน (WebSocket/TCP) สู่สถาปัตยกรรมระดับสากล ซึ่งต้องจัดการกับปัญหาความไม่เสถียรของสัญญาณอินเทอร์เน็ต (Lag, Packet Loss, Latency) อย่างเป็นระบบ

---

## ⚖️ 1. ระดับชั้นการขนส่งข้อมูล (The Transport Layer Protocol)

### ระบบปัจจุบัน: **TCP (บน HTTP WebSocket)**
โปรเจกต์นี้ส่งข้อมูลผ่าน `ws://` ซึ่งมีรากฐานอยู่บนโปรโตคอล TCP

- **พฤติกรรมของ TCP:** TCP เป็นโปรโตคอลที่รับรองความครบถ้วนของข้อมูล กล่าวคือ แพ็กเกตจะถูกส่งตามลำดับ 1, 2, 3, ... หากแพ็กเกตหมายเลข 2 สูญหายระหว่างการส่ง (Packet Loss) อันเนื่องมาจากสัญญาณ Wi-Fi หรือ Cellular TCP จะ **ระงับการรับแพ็กเกตที่เหลือทั้งหมด** และรอจนกว่าจะส่งแพ็กเกตหมายเลข 2 ซ้ำสำเร็จ
- **ผลกระทบในเกม:** เกิดอาการที่เรียกว่า "Lag Spike" หรือภาพติดค้าง (Freeze) แล้วตามด้วยการเคลื่อนที่กระชากของตัวละครอย่างรวดเร็ว (Warp) เมื่อเครือข่ายสะดุดชั่วขณะ

### มาตรฐานสากล: **UDP (WebRTC Data Channels / WebTransport API)**
เกม Action Real-time คุณภาพสูงจะไม่รอรับข้อมูลที่สูญหายไปแล้ว

- **พฤติกรรมของ UDP:** เป็นโปรโตคอลแบบ "ส่งแล้วลืม" (Fire and Forget) หากแพ็กเกตหมายเลข 2 สูญหาย ระบบจะดำเนินการส่งหมายเลข 3 และ 4 ต่อไปทันทีโดยไม่รอ
- **ผลกระทบในเกม:** หากพิกัดของช่วงเวลาที่ผ่านมาสูญหาย ระบบก็เพียงแค่แสดงพิกัดปัจจุบันทับลงไป ทำให้เกมดำเนินต่อเนื่องอย่างลื่นไหล โดยอาจเกิดอาการกระตุกขนาดเล็ก (Micro-stuttering) เท่านั้น แทนที่จะเกิดการหยุดค้างและกระชาก

> **🔥 ข้อพึงทราบสำหรับนักพัฒนาเว็บ:** เบราว์เซอร์ไม่รองรับ API สำหรับเปิด UDP Socket โดยตรง (ต่างจากการเขียนด้วย C++/Go) การบรรลุเป้าหมายนี้บนแพลตฟอร์มเว็บจำเป็นต้องใช้ **WebRTC** ซึ่งมีความซับซ้อนสูง ประกอบด้วยการตั้งค่าเซิร์ฟเวอร์ STUN/TURN, กระบวนการ Signaling Handshake, และการจัดการเส้นทางผ่าน NAT/Firewall (NAT Traversal)

---

## 🏓 2. เทคนิคการปรับปรุงประสิทธิภาพเครือข่ายเกม (Netcode Optimizations)

แม้จะมีการใช้ UDP แล้ว อินเทอร์เน็ตก็ยังคงมีความผันผวน (Network Jitter หรือ Ping ที่ไม่คงที่) เกมเอนจิ้นระดับสากลจึงไม่นำค่า x, y มาวาดบนหน้าจอโดยตรง แต่ใช้เทคนิค 3 วิธีหลักดังต่อไปนี้:

### 2.1 Entity Interpolation & Render in the Past (การแสดงผลข้อมูลในอดีตเพื่อความลื่นไหล)

- **ปัญหาของระบบปัจจุบัน:** เซิร์ฟเวอร์ส่งพิกัดมา 60 ครั้งต่อวินาที ฝั่ง Client รับค่าแล้วอัปเดต `state` ทันที หากพิจารณาอย่างละเอียด (โดยไม่มี CSS Transition ช่วยบรรเทา) วัตถุจะขยับเป็นจังหวะกระตุกตาม 60 FPS หรือหากแพ็กเกตมาถึงไม่สม่ำเสมอ ภาพบอลจะแสดงผลไม่ต่อเนื่อง
- **มาตรฐานสากล:** ฝั่ง Client จะแสดงผล "โลกในอดีต (Past)" อยู่เสมอ เช่น **ยอมรับให้ภาพช้ากว่าความเป็นจริง 100ms**
  - Client จะนำตำแหน่งบอลจาก 150ms ที่แล้ว และ 100ms ที่แล้ว มาคำนวณด้วย Linear Interpolation (Lerp) เพื่อสร้างเฟรมระหว่างกลางให้ต่อเนื่อง
  - ผลลัพธ์คือภาพที่ลื่นไหลในระดับ 60–144 FPS แม้ว่าเซิร์ฟเวอร์จะส่งข้อมูลเพียง 20 FPS หรือมีความล่าช้าไม่สม่ำเสมอก็ตาม

### 2.2 Client-Side Prediction (การคาดการณ์ฝั่ง Client เพื่อแก้ปัญหา Input Lag)

- **สิ่งที่ระบบปัจจุบันทำอยู่:** อนุญาตให้ Pad ของผู้เล่นขยับหน้าจอตามปุ่มที่กดได้ทันที (True Local State Prediction) โดยไม่ต้องรอให้เซิร์ฟเวอร์ตอบกลับ จากนั้นจึงส่งพิกัด X ท่ีคำนวณได้ไปให้เซิร์ฟเวอร์ยอมรับ 
- **ปัญหาของระบบปัจจุบัน (Trade-off):** แม้ผู้เล่นจะรู้สึกว่าเกมลื่นไหลแบบ 0ms (ไม่มี Input Lag) แต่การยอมให้ Client ส่งค่าพิกัดมาตรงๆ ทำให้เกิดช่องโหว่ (Vulnerability) ที่ผู้เล่นอาจเขียนสคริปต์ส่งพิกัดปลอม (Teleport) เพื่อโกงเกมได้ 
- **มาตรฐานสากล (Strict Server Authoritative):** เพื่อป้องกันการโกงระดับ 100% Client จะส่งแค่ "การกดปุ่ม (Input / ทิศทาง / เวลา)" เท่านั้น ห้ามส่งพิกัด X เด็ดขาด จากนั้น Client จะคำนวณพิกัดล่วงหน้า (Predict) และเมื่อเซิร์ฟเวอร์ตอบกลับมาพร้อม `SequenceNumber` Client จะนำข้อมูลจากเซิร์ฟเวอร์มาเทียบ หากผิดพลาดจะดึง Pad กลับไปจุดที่เซิร์ฟเวอร์บอก (Reconciliation) ซึ่งวิธีนี้จะไม่มีใครแฮ็กตำแหน่งได้เลย

### 2.3 Lag Compensation (การชดเชยความล่าช้าฝั่งเซิร์ฟเวอร์)

การเปิดโอกาสให้ผู้เล่นที่มีค่า Ping สูงสามารถโต้ตอบกับเกมได้อย่างเป็นธรรม

- **ปัญหาของระบบปัจจุบัน:** หากผู้เล่นกด *Power Hit* ในจังหวะที่ถูกต้องบนหน้าจอของตน แต่คำสั่ง `ACTION_POWER_HIT` ใช้เวลา 0.1 วินาทีในการเดินทางถึงเซิร์ฟเวอร์ เซิร์ฟเวอร์อาจเห็นว่าบอลเคลื่อนพ้น Pad ไปแล้ว และตัดสินว่าผู้เล่นตีพลาด
- **มาตรฐานสากล:** เซิร์ฟเวอร์ระดับ Enterprise (เช่นในเกม FPS อย่าง CS2) จะจัดเก็บสถานะย้อนหลังไว้ประมาณ 1 วินาทีในหน่วยความจำเสมอ
  - เมื่อผู้เล่นที่มี Ping 100ms แจ้งว่า "กด Power Hit ณ ตำแหน่งนี้"
  - เซิร์ฟเวอร์จะ **ย้อนเวลาสถานะของตัวเองกลับไป 100ms (Rewind States)**
  - จากนั้นตรวจสอบ Hitbox ใหม่ หากพบว่าตำแหน่งบอลเมื่อ 100ms ที่แล้วสัมผัสกับ Pad ของผู้เล่น เซิร์ฟเวอร์จะอนุมัติว่าตีโดน
  - *(นี่คือสาเหตุที่ในเกมยิงปืนชื่อดัง บางครั้งผู้เล่นรู้สึกว่าหลบพ้นแล้ว แต่กลับโดนยิงจากผู้เล่นที่มี Ping สูง)*

---

## 🌍 3. การจัดการ Ping และการกระจาย Server (Ping Management & Regional Deployment)

แม้จะใช้เทคนิค Client-Side Prediction แล้ว **ค่า Ping (Network Latency) ยังคงเป็นปัจจัยสำคัญ** ที่ส่งผลต่อประสบการณ์การเล่นโดยตรง โดยเฉพาะในเกมที่ต้องการความแม่นยำสูงอย่าง Pong

### ผลกระทบของ Ping ต่อการเล่นเกม

ในระบบปัจจุบันที่ใช้ Local State Prediction สำหรับ Pad:
- **Pad ของผู้เล่น:** ตอบสนองทันที 0ms (ไม่ได้รับผลกระทบจาก Ping)
- **ลูกบอลและการชน:** ถูกควบคุมโดย Server Authority ทั้งหมด ทำให้ได้รับผลกระทบจาก Ping โดยตรง

**สถานการณ์ที่เกิดขึ้นเมื่อ Ping สูง (เช่น 150ms ขึ้นไป):**
1. ผู้เล่นเห็นลูกบอลวิ่งมา และเลื่อน Pad ไปดักรอ (บนหน้าจอของตัวเอง)
2. คำสั่งตำแหน่ง Pad ใหม่เริ่มเดินทางไปหา Server (ใช้เวลา ~75ms)
3. แต่ในโลกของ Server ลูกบอลมาถึงเส้นกรอบประตูแล้วตั้งแต่ก่อนหน้านี้
4. Server ตัดสินว่า "Pad ยังไม่ได้เลื่อนมาบัง" → ผู้เล่นเสียแต้ม
5. ผลคือผู้เล่นเห็น **"Ghost Hit"** (ลูกบอลทะลุ Pad ที่ตัวเองเห็นว่ารอรับอยู่แล้ว)

**Sweet Spot สำหรับเกม Pong:** Ping ควรอยู่ในช่วง **30-50ms** เพื่อให้ความรู้สึกในการควบคุมและความสมจริงของการชนสมดุลกัน

### กลยุทธ์การแก้ปัญหา Ping สูง

#### 1. Multi-Region Deployment (แนะนำสำหรับ Production)
กระจาย Backend หลายตัวในภูมิภาคต่างๆ เช่น:
- **Singapore** สำหรับ Southeast Asia (Ping ~20-40ms จากไทย)
- **Tokyo** สำหรับ Japan & Korea
- **Sydney** สำหรับ Oceania
- **Frankfurt** สำหรับ Europe

**ข้อดี:**
- แก้ปัญหาได้ตรงจุด ลด Ping อย่างมีนัยสำคัญ
- ไม่ต้องแก้โค้ดเกม เพียงแค่ Deploy ซ้ำหลายภูมิภาค

**ข้อเสีย:**
- ค่าใช้จ่าย Infrastructure สูงขึ้น
- ต้องจัดการ Matchmaking ข้าม Region (ป้องกันไม่ให้ผู้เล่นคนละภูมิภาคเจอกัน)

#### 2. Edge Computing (Cloudflare Workers, Vercel Edge Functions)
Deploy Backend Logic ไปยัง Edge Nodes ทั่วโลก Request จะถูกส่งไปยัง Node ที่ใกล้ที่สุดโดยอัตโนมัติ

**ข้อดี:**
- ลด Latency โดยอัตโนมัติ
- Scale ได้ดีมาก

**ข้อเสีย:**
- WebSocket บน Edge มีข้อจำกัด (เช่น Connection Time Limit)
- ซับซ้อนกว่าการ Deploy แบบปกติ

#### 3. Server-Side Lag Compensation (Rewind & Replay)
เก็บ State History ย้อนหลัง 200-300ms บน Server เมื่อผู้เล่นกด Power Hit Server จะย้อนเวลากลับไปตามค่า Ping ของผู้เล่น แล้วตรวจสอบว่าตอนนั้นลูกบอลอยู่บน Pad หรือไม่

**ข้อดี:**
- ทำให้ผู้เล่น Ping สูงยังเล่นได้อย่างยุติธรรม
- ใช้ในเกม FPS ระดับโลกอย่าง CS2, Valorant

**ข้อเสีย:**
- โค้ดซับซ้อนมาก ต้องจัดการ State History และ Rollback
- อาจสร้างความรู้สึก "โกง" ให้กับผู้เล่น Ping ต่ำ (เห็นว่าหลบแล้วแต่ยังโดน)

#### 4. Game Design Adjustment
ปรับกติกาหรือพารามิเตอร์เกมให้ Forgiving มากขึ้น:
- เพิ่มขนาด Hitbox ของ Pad เล็กน้อย
- ลดความเร็วลูกบอลในโหมด Casual
- เพิ่มระยะเวลา Power Hit Window

**ข้อดี:**
- ง่ายที่สุด ไม่ต้องแก้โค้ดซับซ้อน
- ช่วยให้เกมเล่นได้สนุกขึ้นสำหรับผู้เล่นทั่วไป

**ข้อเสีย:**
- อาจทำให้เกมรู้สึกง่ายเกินไปสำหรับผู้เล่นที่มี Ping ต่ำ
- ลดความท้าทายและทักษะที่ต้องใช้

---

## 🎯 4. Strict Server Authoritative Implementation (Branch: `professional-netcode`)

โปรเจกต์นี้มี **Branch พิเศษ** ที่แสดงให้เห็นถึงการ implement **Professional Netcode แบบเต็มรูปแบบ** ซึ่งเป็นมาตรฐานที่ใช้ในเกม AAA ระดับโลก

### ความแตกต่างระหว่าง `main` และ `professional-netcode`

| แนวทาง | `main` Branch (Hybrid) | `professional-netcode` Branch (Strict) |
|--------|------------------------|----------------------------------------|
| **Input Handling** | Client ส่งพิกัด X ตรงๆ | Client ส่งแค่ Input (LEFT/RIGHT/STOP) |
| **Server Authority** | ⚠️ บางส่วน | ✅ เต็มรูปแบบ |
| **Cheat Protection** | ⚠️ ต่ำ | ✅ สูงมาก |
| **Reconciliation** | ไม่มี | ✅ มี (Snap + Re-apply) |
| **Sequence Numbers** | ไม่มี | ✅ มี |

### Input-Based Communication Flow

```
Client                          Server
  |                               |
  |--PLAYER_INPUT (seq=1, LEFT)->|
  |  { sequenceNumber: 1,         |
  |    movement: 'LEFT' }         |
  |                               | Process Input
  |                               | Calculate Position
  |                               | Update State
  |<--STATE_UPDATE----------------|
  |  { state: {...},              |
  |    lastProcessedInput: 1 }    |
  | Reconciliation                |
  | (Check Prediction)            |
```

### Server-Side Input Processing

```typescript
// Server คำนวณตำแหน่งจาก Input
public processPlayerInput(role: PlayerRole, input: PlayerInput) {
  // ตรวจสอบ Sequence Number (ป้องกัน Out-of-Order Packets)
  const lastSeq = this.lastProcessedInputSeq.get(role) || 0;
  if (input.sequenceNumber <= lastSeq) return; // ข้าม
  
  this.lastProcessedInputSeq.set(role, input.sequenceNumber);
  
  // คำนวณตำแหน่งใหม่จาก Input
  const dt = TICK_RATE / 1000;
  let moveDir = 0;
  if (input.movement === 'LEFT') moveDir = -1;
  else if (input.movement === 'RIGHT') moveDir = 1;
  
  player.position.x += PAD_SPEED * dt * moveDir;
  player.position.x = clamp(player.position.x, min, max);
}
```

### Client-Side Prediction and Reconciliation

```typescript
// Client: Predict ทันที
const input: PlayerInput = {
  sequenceNumber: ++inputSeqRef.current,
  timestamp: Date.now(),
  movement: 'LEFT'
};

// ส่งไปให้ Server
wsClient.send(WebSocketEvents.PLAYER_INPUT, input);

// Predict ตำแหน่งทันที (0ms Input Lag)
let nextX = currentX + (PAD_SPEED * dt * moveDir);
localPadXRef.current = nextX;

// เก็บไว้สำหรับ Reconciliation
pendingInputsRef.current.set(input.sequenceNumber, input);

// เมื่อได้รับ State จาก Server
if (Math.abs(serverX - predictedX) > 1) {
  // Prediction ผิด - Snap to Server Position
  let correctedX = serverX;
  
  // Re-apply Pending Inputs
  for (const pendingInput of pendingInputs) {
    correctedX += PAD_SPEED * dt * moveDir;
  }
  
  localPadXRef.current = correctedX;
}
```

### ข้อดีของ Strict Server Authoritative

1. **ป้องกันการโกง 100%**
   - Client ไม่สามารถส่งพิกัดปลอม (Teleport) ได้
   - Server คำนวณทุกอย่างเอง

2. **Sequence Number Tracking**
   - ตรวจจับ Packet Loss
   - ตรวจจับ Out-of-Order Packets
   - ตรวจจับ Duplicate Packets

3. **Server Reconciliation**
   - แก้ไข Desync อัตโนมัติ
   - Snap to Server Position ถ้า Prediction ผิด
   - Re-apply Pending Inputs

4. **Input Lag = 0ms**
   - ยังคงใช้ Client-Side Prediction
   - ผู้เล่นรู้สึกว่าเกมตอบสนองทันที

### Trade-offs

**ข้อดี:**
- ✅ ป้องกันการโกงได้ 100%
- ✅ เป็นมาตรฐานสากล (CS2, Valorant, Overwatch)
- ✅ Input Lag = 0ms (เหมือน `main` Branch)

**ข้อเสีย:**
- ⚠️ โค้ดซับซ้อนกว่า 2-3 เท่า
- ⚠️ อาจเห็น Rubber-banding เล็กน้อยถ้า Ping แกว่ง
- ⚠️ Debug ยากขึ้น

### เมื่อไหร่ควรใช้

**ใช้ `main` Branch (Hybrid):**
- Study Project
- Casual Games
- Co-op Games
- Ping ต่ำและเสถียร (< 50ms)

**ใช้ `professional-netcode` Branch (Strict):**
- Production Games
- Competitive Games
- เกมที่มีเงินเดิมพัน
- ต้องการป้องกันการโกง

📄 **อ่านเพิ่มเติม:** [`docs/netcode_comparison.md`](./netcode_comparison.md)

---

## สรุป 🛠 ความเหมาะสมของระบบโปรเจกต์ปัจจุบัน (Simple Setup)

ระบบที่ออกแบบไว้ **เพียงพอสำหรับการเป็นเกมบนเว็บที่สนุกสำหรับการเล่นข้ามภูมิภาคหรือระหว่างผู้เล่นในเครือข่ายใกล้เคียง**

การยกระดับไปสู่ WebRTC และการเขียน Netcode Loop 3 ขั้นตอน (Interpolation + Prediction + Rewind) นั้นมี **ต้นทุนด้านการพัฒนา (Development Overhead)** สูงและต้องอาศัยความเชี่ยวชาญด้านคณิตศาสตร์อย่างมาก จึงเหมาะสำหรับการสร้างเกมเชิงพาณิชย์ขนาดใหญ่ หรือการพัฒนา Engine Platform เป็นหลัก

เอกสารฉบับนี้มีวัตถุประสงค์เพื่อสร้างความตระหนักและจุดประกายความเข้าใจในความท้าทายเหล่านี้ เมื่อใดที่ประสบปัญหาที่ยอมรับไม่ได้จริงๆ (เช่น อาการ Rubber-banding รุนแรง) จึงค่อยนำเครื่องมือเหล่านี้มาประยุกต์ใช้ทีละขั้นตอน
