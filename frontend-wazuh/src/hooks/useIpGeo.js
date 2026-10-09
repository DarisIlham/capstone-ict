import { useEffect, useMemo, useRef, useState } from "react";
import {
  isPublicIpv4,
  readGeoCache,
  writeGeoCache,
  fetchCountry,
  countryCodeToFlag,
  countryName,
} from "../utils/ipGeo";

// Jumlah request yang boleh jalan bersamaan. Table di-refresh tiap 60 detik
// dan satu halaman bisa memuat puluhan IP unik, jadi semua IP tidak boleh
// ditembakkan sekaligus ke API gratisan.
const CONCURRENCY = 5;

const PRIVATE_ENTRY = { code: null, flag: "", name: null, private: true };

/**
 * Resolusi negara untuk sekumpulan IP.
 *
 * Mengembalikan Map ip -> { code, flag, name, private, pending }. IP privat
 * langsung ditandai tanpa menyentuh jaringan, hasil dari API disimpan ke
 * localStorage supaya hanya ditanyakan sekali per IP dalam 30 hari.
 */
export const useIpGeo = (ips) => {
  const [geo, setGeo] = useState(() => readGeoCache());
  const [pending, setPending] = useState(() => new Set());
  const inFlightRef = useRef(new Set());

  // Kunci identitas agar effect tidak jalan ulang karena array baru tiap render.
  const ipsKey = useMemo(
    () => [...new Set((ips || []).filter(Boolean))].sort().join(","),
    [ips]
  );

  useEffect(() => {
    const list = ipsKey ? ipsKey.split(",") : [];
    if (list.length === 0) return undefined;

    const controller = new AbortController();
    const { signal } = controller;
    const resolved = {};
    const queue = [];

    list.forEach((ip) => {
      if (!isPublicIpv4(ip)) return;
      const cached = geo[ip];
      if (cached) {
        resolved[ip] = cached;
        return;
      }
      // inFlightRef mencegah halaman yang sedang di-refresh menembak IP yang
      // sama dua kali sekaligus.
      if (!inFlightRef.current.has(ip)) queue.push(ip);
    });

    if (queue.length > 0) {
      setPending(new Set(queue));
    }

    const run = async () => {
      // Pool sederhana: maksimal CONCURRENCY request jalan bersamaan, sisanya
      // menunggu slot kosong.
      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length && !signal.aborted) {
          const ip = queue[cursor];
          cursor += 1;
          inFlightRef.current.add(ip);
          try {
            const code = await fetchCountry(ip, signal);
            resolved[ip] = {
              code,
              flag: countryCodeToFlag(code),
              name: countryName(code),
              private: false,
            };
          } catch (err) {
            if (err?.name === "AbortError") return;
            // Gagal (rate limit / offline) sengaja TIDAK dicache supaya IP-nya
            // dicoba lagi pada polling berikutnya.
            resolved[ip] = { code: null, flag: "", name: null, private: false, failed: true };
          } finally {
            inFlightRef.current.delete(ip);
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)
      );

      if (signal.aborted) return;
      writeGeoCache(
        Object.fromEntries(
          Object.entries(resolved).map(([ip, value]) => [
            ip,
            { code: value.code, flag: value.flag, name: value.name, private: value.private, at: Date.now() },
          ])
        )
      );
      setPending(new Set());
      setGeo((prev) => ({ ...prev, ...resolved }));
    };

    void run();

    return () => controller.abort();
    // `geo` sengaja tidak jadi dependency: membacanya di dalam effect akan
    // memicu loop tak berujung setiap kali cache terisi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipsKey]);

  return useMemo(() => {
    const result = new Map();
    (ips || []).filter(Boolean).forEach((ip) => {
      const entry = geo[ip];
      if (entry) result.set(ip, entry);
      else if (!isPublicIpv4(ip)) result.set(ip, PRIVATE_ENTRY);
      else result.set(ip, { code: null, flag: "", name: null, private: false, pending: pending.has(ip) });
    });
    return result;
  }, [ips, geo, pending]);
};

export default useIpGeo;