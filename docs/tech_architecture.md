# Pong 1v1 Online: เอกสารสถาปัตยกรรมและระบบการทำงาน (Technical Flow)

เอกสารฉบับนี้จัดทำขึ้นเพื่อเป็น **Project Study** สำหรับนักพัฒนาซอฟต์แวร์ที่ต้องการศึกษาและทำความเข้าใจการออกแบบระบบเกม Multiplayer แบบ Real-time บนเบราว์เซอร์ โดยใช้เทคโนโลยี WebSockets ผ่านสถาปัตยกรรม Authoritative Server

---

## 🏗️ 1. ภาพรวมสถาปัตยกรรม (Architecture Overview)

โปรเจกต์นี้แบ่งออกเป็น 3 ส่วนหลัก (Workspace) ที่ทำงานสอดประสานกันภายใต้โครงสร้าง Monorepo:

1. **`pong-shared`**: คลังข้อมูลกลาง (Single Source of Truth) จัดเก็บกฎของเกม, โครงสร้างข้อมูล (`Types`) และชื่อ Event (`Enums/Constants`) เพื่อให้ Frontend และ Backend ใช้ข้อมูลชุดเดียวกันอย่างสมบูรณ์
2. **`pong-be` (Backend - The Authoritative Server)**: ส่วนประมวลผลหลักของระบบ เขียนด้วย Node.js/Bun บน Express และโมดูล `ws` รับผิดชอบการรัน "Game Engine" ตรวจสอบฟิสิกส์, การชน และป้องกันการทุจริต (Anti-Cheat)
3. **`pong-fe` (Frontend - The Dumb Client)**: ส่วนแสดงผลเขียนด้วย React + Vite ทำหน้าที่รับสถานะเกมจากเซิร์ฟเวอร์มาแสดงผล (Rendering) อย่างลื่นไหล และส่งข้อมูล Input ของผู้เล่นกลับไปให้เซิร์ฟเวอร์ประมวลผล

### แผนภาพสถาปัตยกรรม

```mermaid
graph TD
    subgraph Client ["Frontend (Browser)"]
        UI["React UI / CSS / HTML"]
        Input["Keyboard & Touch Listeners"]
        WS_Client["WebSocket Client Wrapper"]
        Predict["Client-side Prediction & Lerp"]
    end

    subgraph Server ["Backend (Bun/Node.js)"]
        WS_Server["Native WebSocket Server"]
        RoomMgr["Room Manager (UUID Matchmaking)"]
        Engine["Game Engine (30FPS Loop)"]
    end

    Input -->|"ส่งคำสั่ง (ซ้าย/ขวา/เสิร์ฟ)"| WS_Client
    WS_Client <-->|TCP ws://| WS_Server
    WS_Server --> RoomMgr
    RoomMgr -->|"จับคู่ผู้เล่น 2 คน"| Engine
    Engine -->|"ประมวลผลฟิสิกส์ & ชนะ/แพ้"| WS_Server
    WS_Client -->|"แปลง State เป็นภาพ"| Predict
    Predict --> UI
```

---

## 🔄 2. วงจรเวลาและอัตราการอัปเดต (The Game Loop Definition)

องค์ประกอบสำคัญของเกม Real-time คือกรอบเวลา (Tick Rate) ระบบนี้ออกแบบด้วยแนวคิดกึ่ง Real-time เพื่อจัดสมดุลระหว่างประสิทธิภาพและทรัพยากร:

- **Server Tick Rate (30 FPS)**: `GameEngine.ts` ประมวลผลตำแหน่งลูกบอลและ Pad ทุก `33.33ms`
- **Client Frame Rate (60 FPS ขึ้นไป)**: เบราว์เซอร์ใช้อัตราเฟรมตามความสามารถของหน้าจอ (ผ่าน `requestAnimationFrame` หรือ React State Updates) เพื่ออัปเดตกราฟิกอย่างลื่นไหล

---

## 🎮 3. ลำดับเหตุการณ์และสถานะเกม (Event Flow & Game Phases)

วงจรของเกมแบ่งออกเป็น 5 สถานะหลัก (Game Phase):

1. **`WAITING_FOR_OPPONENT`**: ผู้สร้างห้อง (CREATOR) ได้รับ UUID เซิร์ฟเวอร์จัดสรรทรัพยากรสำหรับห้องใหม่ แต่ยังไม่เริ่ม Game Loop จนกว่า JOINER จะเชื่อมต่อเข้ามา
2. **`SERVING`**: ลูกบอลหยุดนิ่งและติดอยู่กับ Pad ของผู้มีสิทธิ์เสิร์ฟ รอรับ Event `ACTION_SERVE` จาก Client
3. **`PLAYING`**: Game Engine วนประมวลผลตรวจจับการชน (Pad Collision & Bounce Angles), ขอบสนาม และรับ Event `ACTION_POWER_HIT`
4. **`PAUSED_DISCONNECT`**: หากสัญญาณ WebSocket หลุด เซิร์ฟเวอร์จะระงับ Game Loop และเริ่มนับเวลา Grace Period (60 วินาที) พร้อมแจ้งสถานะการหยุดชั่วคราวแก่ผู้เล่นทั้งสองฝ่าย
5. **`GAME_OVER`**: เกมสิ้นสุดเมื่อหมดเวลา Reconnect หรือเข้าเงื่อนไขจบเกม เซิร์ฟเวอร์ประกาศผลและดำเนินการ Cleanup ทรัพยากรของห้อง

### แผนภาพลำดับขั้นตอนการเล่น

```mermaid
sequenceDiagram
    participant Player1 as Creator (FE)
    participant Player2 as Joiner (FE)
    participant Server as Backend (BE)

    Player1->>Server: CREATE_ROOM
    Server-->>Player1: ROOM_CREATED UUID
    Note right of Player1: Waiting for opponent...

    Player2->>Server: JOIN_ROOM UUID
    Server-->>Player1: OPPONENT_JOINED + GAME_STATE_UPDATE SERVING
    Server-->>Player2: ROOM_JOINED + GAME_STATE_UPDATE SERVING

    Note over Player1,Server: Phase: SERVING
    Player1->>Server: ACTION_SERVE
    Note over Server: เซิร์ฟเวอร์คำนวณความเร็วบอลเริ่มต้น

    loop 30 Times/Sec
        Note over Player1,Server: Phase: PLAYING
        Player1->>Server: PAD_MOVE x, direction
        Player2->>Server: PAD_MOVE x, direction
        Note over Server: เซิร์ฟเวอร์ขยับบอล, ตรวจสอบการชนขอบสนาม / ชน Pad
        Server-->>Player1: GAME_STATE_UPDATE Timestamp
        Server-->>Player2: GAME_STATE_UPDATE Timestamp
    end

    Note over Server: บอลผ่านขอบสนาม ฝ่ายใดฝ่ายหนึ่งรับพลาด
    Server-->>Player1: GAME_STATE_UPDATE SERVING + Score Update
    Server-->>Player2: GAME_STATE_UPDATE SERVING + Score Update
```

---

## 🛠️ 4. หลักการออกแบบที่น่าสนใจในโปรเจกต์นี้

- **Perspective Inversion (การกลับทิศทางมุมมอง)**

  เกม Pong แนวตั้งมีปัญหาหลักด้านพิกัดเมื่อผู้เล่นสองฝ่ายมีมุมมองตรงข้ามกัน
  - *ปัญหา*: Player 2 (Joiner) จะมองตัวละครของตนอยู่ด้านบน และปุ่มซ้าย-ขวาสลับทิศกัน
  - *วิธีแก้ไข*: เซิร์ฟเวอร์คำนวณพิกัดตามแนวแกนปกติ แต่ฝั่ง React (`Arena.tsx`) ของ Joiner จะแปลงพิกัดด้วยการคูณ `-1` หรือ `MAX_HEIGHT - y` เพื่อกลับทิศแสดงผล ทำให้ผู้เล่นทั้งสองฝ่ายรับรู้ว่าตนเองอยู่ "ด้านล่างของสนาม" เสมอ โดยไม่เพิ่มความซับซ้อนในโค้ดเซิร์ฟเวอร์

- **Optimistic UI Constraints**

  เมื่อผู้เล่นกดเลื่อน Pad Client จะขยับ Pad ในหน้าจอทันที (Optimistic Update) โดยไม่รอการยืนยันจากเซิร์ฟเวอร์ เพื่อให้การตอบสนองลื่นไหลและไม่มีความล่าช้า อย่างไรก็ตาม Client ต้องคำนวณขอบเขตสนาม (Clamp Bounds) ให้ตรงกับเซิร์ฟเวอร์ เพื่อป้องกันไม่ให้ Pad เคลื่อนที่เกินขอบสนาม

- **Power Hit Geometry & Bounce Blending (คณิตศาสตร์ของการเด้ง)**

  ระบบการสะท้อนของลูกบอลใช้การผสมผสาน (Blending) ระหว่างสองแนวคิด:
  1. **Physics Reflection**: มุมกระทบเท่ากับมุมสะท้อนตามกฎฟิสิกส์จริง เพื่อความสมจริงและเป็นธรรมชาติ
  2. **Arkanoid-bounce Logic**: มุมสะท้อนขึ้นอยู่กับจุดที่ลูกบอลกระทบ Pad (ยิ่งใกล้ขอบ มุมยิ่งกว้าง) เพื่อให้ผู้เล่นควบคุมทิศทางได้
  
  โดยใช้ `BOUNCE_BLEND_FACTOR` (0.4) ในการคำนวณมุมสุดท้าย ทำให้เกมมีความสมจริงแต่ยังคงความสนุกในการควบคุมทิศทางได้

  เมื่อผู้เล่นกด Power Hit เซิร์ฟเวอร์จะเพิ่มความเร็วเป็น 2 เท่า และบีบมุมสะท้อนให้แคบลงครึ่งหนึ่ง ทำให้ลูกพุ่งตรงและรวดเร็วขึ้น

- **Continuous Collision Detection — CCD (การตรวจจับการชนแบบต่อเนื่อง)**

  ระบบฟิสิกส์ใช้ CCD สำหรับการชนระหว่างบอลกับ Pad แทนที่จะใช้วิธี Discrete (เลื่อนบอลก่อนแล้วค่อยเช็คว่า overlap กันหรือไม่) ซึ่งอาจทำให้บอลกระโดดข้าม Pad ในเฟรมเดียว
  - *วิธีการ*: คำนวณเวลาที่แน่นอน (`t`) ภายใน `dt` ที่ขอบบอลจะสัมผัสกับหน้า Pad จากนั้นตรวจสอบว่า ณ เวลา `t` บอลอยู่ในแนว X ของ Pad หรือไม่
  - *การ Bounce*: เลื่อนบอลไปที่จุดชน → คำนวณ velocity ใหม่ → เลื่อนบอลต่อด้วยเวลาที่เหลือ (`dt - t`)
  - *ผลลัพธ์*: บอลจะสัมผัส Pad พอดีก่อนเด้งกลับเสมอ ไม่มีอาการ "เด้งก่อนถึง" หรือ "ทะลุ Pad" แม้บอลจะเคลื่อนที่เร็ว (Power Hit ×2)
  - *Bounce Contact (จุดชนบน Frontend)*: เซิร์ฟเวอร์แนบตำแหน่งจุดชน (`bounceContact`) ไปกับ State Update ทุกครั้งที่บอลกระทบ Pad ฝั่ง Frontend ใช้เทคนิค Two-phase Animation — แสดงบอลที่จุดชนก่อน 1 เฟรม (ไม่มี transition) แล้วค่อย transition ไปตำแหน่งหลัง bounce ทำให้ผู้เล่นเห็นบอลสัมผัส Pad ทุกกรณีโดยไม่ขึ้นกับ tick rate
