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
  const [stickerLibrary, setStickerLibrary] = useState<string[]>([]);
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [activeStickerId, setActiveStickerId] = useState<string | null>(null);

  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [journalDate, setJournalDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const journalRef = useRef<HTMLDivElement>(null);

  // Biến phục vụ kéo thả bằng cảm ứng Touch
  const dragItem = useRef<{ id: string; startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  useEffect(() => {
    preload();
  }, []);

  // 1. MỞ / TẮT CAMERA
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
      alert("Hãy cho phép ứng dụng truy cập camera trên điện thoại nhé!");
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

  // 2. BO VIỀN & TÁCH NỀN STICKER
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

  async function processImageToSticker(imageSource: string | Blob) {
    setLoading(true);
    try {
      const blob = await removeBackground(imageSource);
      const noBgUrl = URL.createObjectURL(blob);
      const finalSticker = await applyStickerBorder(noBgUrl);
      setStickerLibrary((prev) => [finalSticker, ...prev]);
    } catch (error) {
      alert("Tách nền thất bại, vui lòng thử lại!");
    } finally {
      setLoading(false);
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageToSticker(file);
  };

  // 3. THAO TÁC STICKER TÊN MÀN HÌNH CẢM ỨNG ĐIỆN THOẠI
  const addStickerToJournal = (src: string) => {
    const newSticker: PlacedSticker = {
      id: Date.now().toString(),
      src,
      x: 30 + Math.random() * 40,
      y: 100 + Math.random() * 40,
      size: 110,
    };
    setPlacedStickers((prev) => [...prev, newSticker]);
    setActiveStickerId(newSticker.id);
  };

  const updateStickerSize = (id: string, delta: number) => {
    setPlacedStickers((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, size: Math.max(40, item.size + delta) } : item
      )
    );
  };

  const removeStickerFromJournal = (id: string) => {
    setPlacedStickers((prev) => prev.filter((item) => item.id !== id));
    if (activeStickerId === id) setActiveStickerId(null);
  };

  // SỰ KIỆN KÉO THẢ TRÊN ĐIỆN THOẠI (TOUCH EVENTS)
  const handleTouchStart = (e: React.TouchEvent, sticker: PlacedSticker) => {
    setActiveStickerId(sticker.id);
    const touch = e.touches[0];
    dragItem.current = {
      id: sticker.id,
      startX: touch.clientX,
      startY: touch.clientY,
      initialX: sticker.x,
      initialY: sticker.y,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragItem.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragItem.current.startX;
    const dy = touch.clientY - dragItem.current.startY;

    const newX = dragItem.current.initialX + dx;
    const newY = dragItem.current.initialY + dy;

    setPlacedStickers((prev) =>
      prev.map((item) =>
        item.id === dragItem.current?.id ? { ...item, x: newX, y: newY } : item
      )
    );
  };

  const handleTouchEnd = () => {
    dragItem.current = null;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-3 md:p-8 flex flex-col items-center select-none">
      <h1 className="text-2xl md:text-3xl font-bold text-pink-500 mb-4 text-center">
        📖 Nhật Ký Sticker Số
      </h1>

      <canvas ref={canvasRef} className="hidden" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-6xl">
        {/* KHU VỰC CÔNG CỤ & KHAY STICKER */}
        <div className="flex flex-col gap-4 bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <h2 className="text-lg font-semibold text-pink-400">✨ Tạo Sticker</h2>

          <div className="grid grid-cols-2 gap-3">
            {!isCameraActive ? (
              <button
                onClick={startCamera}
                className="bg-pink-600 active:bg-pink-700 py-3 rounded-xl font-semibold text-sm transition"
              >
                📷 Camera
              </button>
            ) : (
              <div className="col-span-2 flex flex-col items-center gap-2">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full max-h-48 object-cover rounded-xl border border-pink-500"
                />
                <div className="flex gap-2 w-full">
                  <button
                    onClick={capturePhoto}
                    className="flex-1 bg-green-600 py-2 rounded-lg font-semibold text-sm"
                  >
                    📸 Chụp
                  </button>
                  <button
                    onClick={stopCamera}
                    className="flex-1 bg-red-600 py-2 rounded-lg font-semibold text-sm"
                  >
                    ✖ Tắt
                  </button>
                </div>
              </div>
            )}

            <label className="text-center bg-zinc-800 active:bg-zinc-700 py-3 rounded-xl font-semibold text-sm cursor-pointer border border-zinc-700 transition flex items-center justify-center">
              📁 Tải Ảnh
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {loading && (
            <p className="text-yellow-400 text-xs animate-pulse text-center">
              ⏳ AI đang tách nền sticker...
            </p>
          )}

          {/* KHAY THƯ VIỆN STICKER */}
          <div className="flex flex-col gap-2">
            <span className="text-xs text-zinc-400">
              Chạm vào sticker để dán vào sổ:
            </span>
            <div className="flex gap-3 overflow-x-auto p-2 bg-zinc-950 rounded-xl border border-zinc-800">
              {stickerLibrary.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-4 w-full">
                  Chưa có sticker nào. Hãy chụp hoặc tải ảnh lên nhé!
                </p>
              ) : (
                stickerLibrary.map((src, index) => (
                  <button
                    key={index}
                    onClick={() => addStickerToJournal(src)}
                    className="p-2 bg-zinc-900 rounded-lg active:scale-95 transition border border-zinc-800 shrink-0"
                  >
                    <img
                      src={src}
                      alt="Sticker"
                      className="w-14 h-14 object-contain"
                    />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* TRANG SỔ NHẬT KÝ */}
        <div className="lg:col-span-2 flex flex-col items-center w-full">
          <div
            ref={journalRef}
            className="relative w-full min-h-[500px] bg-[#fbf7ee] text-zinc-800 p-5 md:p-8 rounded-2xl shadow-2xl border-2 border-[#e6decb] flex flex-col gap-3 overflow-hidden touch-none"
            style={{
              backgroundImage: "linear-gradient(#e5e0d8 1px, transparent 1px)",
              backgroundSize: "100% 28px",
            }}
          >
            {/* TIÊU ĐỀ & NGÀY */}
            <div className="flex flex-col gap-2 border-b-2 border-pink-300 pb-2 bg-[#fbf7ee]/80 backdrop-blur-sm">
              <input
                type="text"
                placeholder="Tiêu đề nhật ký..."
                value={journalTitle}
                onChange={(e) => setJournalTitle(e.target.value)}
                className="bg-transparent text-xl font-bold text-zinc-900 outline-none w-full"
              />
              <input
                type="date"
                value={journalDate}
                onChange={(e) => setJournalDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-zinc-600 outline-none"
              />
            </div>

            {/* NỘI DUNG NHẬT KÝ */}
            <textarea
              placeholder="Nhập nội dung nhật ký tại đây và dùng ngón tay di chuyển các sticker trang trí..."
              value={journalContent}
              onChange={(e) => setJournalContent(e.target.value)}
              className="w-full flex-1 bg-transparent text-base leading-[28px] outline-none resize-none text-zinc-800 font-sans"
              rows={10}
            />

            {/* HIỂN THỊ STICKER DÁN TRÊN SỔ */}
            {placedStickers.map((item) => {
              const isActive = activeStickerId === item.id;
              return (
                <div
                  key={item.id}
                  onTouchStart={(e) => handleTouchStart(e, item)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onClick={() => setActiveStickerId(item.id)}
                  className={`absolute cursor-move touch-none ${
                    isActive ? "ring-2 ring-pink-500 rounded-lg p-1" : ""
                  }`}
                  style={{ top: `${item.y}px`, left: `${item.x}px` }}
                >
                  <img
                    src={item.src}
                    alt="Sticker"
                    style={{ width: `${item.size}px` }}
                    className="object-contain drop-shadow-md pointer-events-none"
                  />

                  {/* THANH ĐIỀU CHỈNH PHÓNG TO / THU NHỎ / XÓA */}
                  {isActive && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-900/90 text-white rounded-full px-2 py-1 flex gap-2 border border-zinc-700 shadow-lg">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStickerSize(item.id, 15);
                        }}
                        className="w-6 h-6 bg-zinc-800 rounded-full font-bold text-xs"
                      >
                        +
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStickerSize(item.id, -15);
                        }}
                        className="w-6 h-6 bg-zinc-800 rounded-full font-bold text-xs"
                      >
                        -
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStickerFromJournal(item.id);
                        }}
                        className="w-6 h-6 bg-red-600 rounded-full font-bold text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}