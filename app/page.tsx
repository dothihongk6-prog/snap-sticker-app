"use client";

import { useState, useRef, useEffect } from "react";
import { preload, removeBackground } from "@imgly/background-removal";

interface PlacedSticker {
  id: string;
  src: string;
  x: number;
  y: number;
  size: number;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  // Quản lý danh sách Sticker đã tạo
  const [stickerLibrary, setStickerLibrary] = useState<string[]>([]);
  // Quản lý các Sticker được dán trên trang nhật ký
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  
  // Dữ liệu nhật ký
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [journalDate, setJournalDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const journalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    preload();
  }, []);

  // 1. QUẢN LÝ CAMERA
  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert("Không thể truy cập camera!");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          stopCamera();
          processImageToSticker(blob);
        }
      }, "image/png");
    }
  };

  // 2. TẠO VIỀN TRẮNG STICKER
  const applyStickerBorder = (imageSrc: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        const borderSize = 14;
        const canvas = canvasRef.current || document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        canvas.width = img.width + borderSize * 2;
        canvas.height = img.height + borderSize * 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        const maskCtx = maskCanvas.getContext("2d");

        if (maskCtx) {
          maskCtx.drawImage(img, borderSize, borderSize);
          maskCtx.globalCompositeOperation = "source-in";
          maskCtx.fillStyle = "#FFFFFF";
          maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

          for (let angle = 0; angle < 360; angle += 15) {
            const x = Math.cos((angle * Math.PI) / 180) * borderSize;
            const y = Math.sin((angle * Math.PI) / 180) * borderSize;
            ctx.drawImage(maskCanvas, x, y);
          }
        }

        ctx.drawImage(img, borderSize, borderSize);
        resolve(canvas.toDataURL("image/png"));
      };
    });
  };

  // 3. TÁCH NỀN VÀ THÊM VÀO THƯ VIỆN STICKER
  async function processImageToSticker(imageSource: string | Blob) {
    setLoading(true);
    try {
      const blob = await removeBackground(imageSource);
      const noBgUrl = URL.createObjectURL(blob);
      const finalSticker = await applyStickerBorder(noBgUrl);
      setStickerLibrary((prev) => [finalSticker, ...prev]);
    } catch (error) {
      alert("Tách nền thất bại, thử lại nhé!");
    } finally {
      setLoading(false);
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageToSticker(file);
  };

  // 4. DÁN STICKER VÀO TRANG SỔ
  const addStickerToJournal = (src: string) => {
    const newSticker: PlacedSticker = {
      id: Date.now().toString(),
      src,
      x: 50 + Math.random() * 50,
      y: 50 + Math.random() * 50,
      size: 100,
    };
    setPlacedStickers((prev) => [...prev, newSticker]);
  };

  const removeStickerFromJournal = (id: string) => {
    setPlacedStickers((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8 flex flex-col items-center">
      <h1 className="text-3xl font-bold text-pink-500 mb-6">
        📖 Nhật Ký Sticker Số
      </h1>

      <canvas ref={canvasRef} className="hidden" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-6xl">
        {/* CỘT TRÁI: BỘ TẠO & THƯ VIỆN STICKER */}
        <div className="flex flex-col gap-6 bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
          <h2 className="text-xl font-semibold text-pink-400">
            ✨ Tạo & Kho Sticker
          </h2>

          {/* CHỤP / TẢI ẢNH */}
          <div className="flex flex-col gap-3">
            {!isCameraActive ? (
              <button
                onClick={startCamera}
                className="w-full bg-pink-600 hover:bg-pink-500 py-3 rounded-xl font-semibold transition"
              >
                📷 Chụp Sticker Mới
              </button>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full max-h-48 object-cover rounded-xl border border-pink-500"
                />
                <div className="flex gap-2 w-full">
                  <button
                    onClick={capturePhoto}
                    className="flex-1 bg-green-600 py-2 rounded-lg font-semibold"
                  >
                    📸 Chụp
                  </button>
                  <button
                    onClick={stopCamera}
                    className="flex-1 bg-red-600 py-2 rounded-lg font-semibold"
                  >
                    ✖ Tắt
                  </button>
                </div>
              </div>
            )}

            <label className="w-full text-center bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl font-semibold cursor-pointer border border-zinc-700 transition">
              📁 Tải Ảnh Tự Chọn...
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {loading && (
            <p className="text-yellow-400 text-sm animate-pulse text-center">
              ⏳ AI đang tách nền sticker...
            </p>
          )}

          {/* KHAY THƯ VIỆN STICKER */}
          <div className="flex flex-col gap-2 mt-2">
            <span className="text-sm font-medium text-zinc-400">
              Chạm vào sticker để dán vào sổ:
            </span>
            <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto p-2 bg-zinc-950 rounded-xl border border-zinc-800">
              {stickerLibrary.length === 0 ? (
                <p className="col-span-3 text-xs text-zinc-600 text-center py-6">
                  Chưa có sticker nào. Hãy chụp hoặc tải ảnh lên nhé!
                </p>
              ) : (
                stickerLibrary.map((src, index) => (
                  <button
                    key={index}
                    onClick={() => addStickerToJournal(src)}
                    className="p-2 bg-zinc-900 rounded-lg hover:scale-105 transition border border-zinc-800 flex items-center justify-center"
                  >
                    <img
                      src={src}
                      alt="Sticker"
                      className="w-16 h-16 object-contain"
                    />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* CỘT PHẢI: TRANG SỔ NHẬT KÝ */}
        <div className="lg:col-span-2 flex flex-col items-center">
          <div
            ref={journalRef}
            className="relative w-full min-h-[550px] bg-[#fbf7ee] text-zinc-800 p-8 rounded-2xl shadow-2xl border-2 border-[#e6decb] flex flex-col gap-4 overflow-hidden"
            style={{
              backgroundImage:
                "linear-gradient(#e5e0d8 1px, transparent 1px)",
              backgroundSize: "100% 28px",
            }}
          >
            {/* TIÊU ĐỀ & NGÀY */}
            <div className="flex flex-col md:flex-row justify-between gap-4 border-b-2 border-pink-300 pb-2 bg-[#fbf7ee]/80 backdrop-blur-sm">
              <input
                type="text"
                placeholder="Tiêu đề nhật ký hôm nay..."
                value={journalTitle}
                onChange={(e) => setJournalTitle(e.target.value)}
                className="bg-transparent text-2xl font-bold text-zinc-900 outline-none w-full"
              />
              <input
                type="date"
                value={journalDate}
                onChange={(e) => setJournalDate(e.target.value)}
                className="bg-transparent text-sm font-semibold text-zinc-600 outline-none cursor-pointer"
              />
            </div>

            {/* NỘI DUNG NHẬT KÝ */}
            <textarea
              placeholder="Hôm nay bạn có gì vui? Viết vào đây và dán sticker trang trí nhé..."
              value={journalContent}
              onChange={(e) => setJournalContent(e.target.value)}
              className="w-full flex-1 bg-transparent text-lg leading-[28px] outline-none resize-none text-zinc-800 font-sans"
              rows={12}
            />

            {/* HIỂN THỊ CÁC STICKER ĐÃ DÁN TRÊN TRANG SỔ */}
            {placedStickers.map((item) => (
              <div
                key={item.id}
                className="absolute group cursor-move"
                style={{ top: `${item.y}px`, left: `${item.x}px` }}
              >
                <img
                  src={item.src}
                  alt="Sticker"
                  style={{ width: `${item.size}px` }}
                  className="object-contain drop-shadow-md transition group-hover:scale-105"
                />
                <button
                  onClick={() => removeStickerFromJournal(item.id)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}