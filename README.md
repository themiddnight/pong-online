# 🏓 Pong 1v1 Online Multiplayer

โปรเจกต์นี้เป็นเกม Pong 1v1 แบบผู้เล่นหลายคนผ่านเครือข่ายออนไลน์ ในมุมมองแนวตั้ง (Vertical Aspect Ratio 2:3) สไตล์ Pixel Art คลาสสิก
ออกแบบและพัฒนาสถาปัตยกรรมขึ้นเพื่อเป็น **Project Study** สำหรับการศึกษาการพัฒนาเกม Real-Time Multiplayer บนแพลตฟอร์มเว็บ

ขับเคลื่อนด้วย **Authoritative Game Server**, **WebSockets**, และ **Client-Side Prediction Rendering**

---

## 🏗 โครงสร้างโปรเจกต์ (Monorepo Workspaces)

โปรเจกต์นี้ใช้ `Bun Workspaces` เพื่อประสิทธิภาพในการจัดการแพ็กเกจ โดยแบ่งออกเป็น 3 ส่วนหลักดังนี้:

1. **📂 `pong-shared/`** (Shared Constants & Types)
   เป็นคลังข้อมูลกลางที่จัดเก็บกฎของตัวเกม, อัตราเฟรม, ความเร็วบอล รวมถึง `TypeScript Types` ที่ Frontend และ Backend ใช้ร่วมกัน เพื่อป้องกันความไม่สอดคล้องของชนิดข้อมูล

2. **🤖 `pong-be/`** (Backend - The Authoritative Server)
   เซิร์ฟเวอร์ทำงานบน **Express Server + Native WebSockets** รับผิดชอบการรัน Game Loop ฟิสิกส์ที่อัปเดตสถานะ 30 FPS, การจับคู่ห้องผ่าน UUID และการตรวจสอบกติกาเพื่อป้องกันการทุจริต (เช่น ตำแหน่ง Pad หรือการกด Power Hit)

3. **🎨 `pong-fe/`** (Frontend - The Dumb Client)
   ส่วนแสดงผลฝั่งผู้เล่น เขียนด้วย **React 19 + Vite** และ Styled ด้วย **TailwindCSS v4** แสดงผลกราฟิกที่ลื่นไหล 60 FPS ผ่านระบบ `Client-side Interpolation / Prediction` เพื่อให้ผู้เล่นได้รับการตอบสนองทันทีโดยไม่ขึ้นอยู่กับค่า Ping

---

## 📖 เอกสารอ้างอิงสำหรับการศึกษาเชิงลึก (Developer Documentation)

สำหรับนักพัฒนาที่ต้องการศึกษา Real-Time Netcode หรือทำความเข้าใจ Logic ของเกม สามารถอ้างอิงจากเอกสารต่อไปนี้:

- 📘 [**tech_architecture.md**](./docs/tech_architecture.md): เอกสารสรุปสถาปัตยกรรมระบบ, Game Phases Loop, และแผนภาพ Flow การทำงานของ WebSockets
- 📙 [**engine_standards.md**](./docs/engine_standards.md): เอกสารเปรียบเทียบมาตรฐาน Game Engine (TCP vs UDP) และ 3 เทคนิคหลักที่เกมระดับสากลใช้ (Interpolation, Prediction และ Lag Compensation) สำหรับการต่อยอดโปรเจกต์
- 📓 [**rule_and_constrain.md**](./docs/rule_and_constrain.md): ข้อกำหนดและกติกาของตัวเกมทั้งหมด สำหรับการพอร์ตระบบเกม Atari สู่แพลตฟอร์มออนไลน์
- ⚛️ [**physics_explanation.md**](./docs/physics_explanation.md): เจาะลึกระบบฟิสิกส์ การคำนวณการชน (CCD) และการผสมผสานมุมสะท้อนแบบสมจริง (Bounce Blending) สำหรับคนไม่มีพื้นฐาน
- 🚀 [**deployment_guide.md**](./docs/deployment_guide.md): คู่มือการ Deploy ระบบขึ้น Production (Vercel & Railway)

---

## 🎮 การติดตั้งและการรันโปรเจกต์ (Getting Started)

### ข้อกำหนดเบื้องต้น (Prerequisites)
- ติดตั้ง **[Bun](https://bun.sh/)** Runtime (ใช้งานเป็น Package Manager แทน npm/yarn)
- Node.js (Optional สำหรับความเข้ากันได้เพิ่มเติม)

### ขั้นตอนการรันระบบในเครื่อง (Running The Game Locally)

1. ติดตั้ง Dependencies ของ Workspaces ทั้งหมดจาก Root ด้วยคำสั่ง:
   ```bash
   bun install
   ```
2. รันคำสั่ง `dev` เพื่อเปิดใช้งานบริการทั้งฝั่ง Backend และ Frontend แบบขนานกัน (Concurrently):
   ```bash
   bun run dev
   ```
3. เปิดเบราว์เซอร์ **2 หน้าต่าง (จำลอง 2 ผู้เล่น)** และเข้าถึง URL:
   - `http://localhost:5173`

4. **Player 1 (ผู้สร้างห้อง)**: กดปุ่ม "Create Room" จากนั้นกด "Copy UUID" เพื่อส่งรหัสให้คู่เล่น
5. **Player 2 (ผู้เข้าร่วม)**: กดปุ่ม "Join Room" และวาง UUID ที่ได้รับ

*(เกมจะเริ่มต้นทันทีเมื่อผู้เล่นทั้งสองฝ่ายเชื่อมต่อสำเร็จ โดยใช้ `เมาส์` หรือ `การสัมผัส (Touch)` เลื่อนซ้าย/ขวาเพื่อควบคุม Pad, `คลิก` หรือ `แตะ` เพื่อเสิร์ฟลูก และสร้างช็อต Power Hit)*

---

## 💡 ฟีเจอร์หลัก (Key Features)

- **1v1 Room Matching**: ระบบสร้างและเข้าร่วมห้องแบบ Private โดยแต่ละ Session แยกออกจากกันโดยสมบูรณ์
- **Anti-Cheat Physics**: ตรรกะทั้งหมด (รวมถึงการตรวจสอบพิกัด) ถูกประมวลผลและแก้ไขบนฝั่ง Backend เสมอ
- **Disconnect Grace Period**: หากเชื่อมต่อหลุด เกมจะถูก Pause ทันที และมอบเวลา 60 วินาทีให้ผู้เล่นเชื่อมต่อกลับและกู้คืนเกมได้
- **Dynamic Visual Rendering**: กราฟิกใช้ CSS Transition ผสมผสาน Client Prediction เพื่อแสดงผลอย่างลื่นไหลโดยไม่มีอาการ Warp
- **Cross-platform Support**: สัดส่วน 2:3 รองรับทั้งจอมือถือและจอคอมพิวเตอร์ พร้อมปุ่ม Mobile Virtual Inputs แบบสัมผัส

---

### License
โปรเจกต์นี้เผยแพร่เป็น Open-source สำหรับจุดประสงค์ทางการศึกษาและการพัฒนาทักษะของนักพัฒนาซอฟต์แวร์
