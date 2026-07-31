/**
 * Matemática solar — puro, sem dependência de estado global.
 * Algoritmo de posição solar: NOAA Solar Calculator.
 * Irradiância de céu claro: Hottel simplificado com massa de ar Kasten-Young.
 */
import * as THREE from 'three';

export const RAD = Math.PI / 180;

/** Posição do sol. Azimute em graus a partir do norte, sentido horário. */
export function solar(lat, lon, tz, diaDoAno, hora) {
  const g = (2 * Math.PI / 365) * (diaDoAno - 1 + (hora - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
           - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
            - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
            - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hora * 60 + eq + 4 * lon - 60 * tz;
  const ha = (tst / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cz = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, cz)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { alt: alt / RAD, azi: (az / RAD + 180 + 360) % 360, dec: dec / RAD };
}

/** Vetor unitário apontando para o sol. +X leste, +Y zênite, -Z norte. */
export const vetorSol = (alt, azi) => new THREE.Vector3(
  Math.sin(azi * RAD) * Math.cos(alt * RAD),
  Math.sin(alt * RAD),
  -Math.cos(azi * RAD) * Math.cos(alt * RAD));

/** Normal de um plano inclinado. */
export const normalPlano = (tilt, azi) => new THREE.Vector3(
  Math.sin(azi * RAD) * Math.sin(tilt * RAD),
  Math.cos(tilt * RAD),
  -Math.cos(azi * RAD) * Math.sin(tilt * RAD));

/** Massa de ar (Kasten-Young), com sa em radianos. */
export const AM_KY = sa =>
  1 / (Math.sin(sa) + 0.50572 * Math.pow(sa / RAD + 6.07995, -1.6364));

/** Irradiação de um dia sobre um plano, em kWh/m². Céu claro. */
export function irradDiaPlano(lat, lon, tz, dia, tilt, azi, passo = 0.25) {
  const nrm = normalPlano(tilt, azi);
  let soma = 0;
  for (let h = 4; h <= 20; h += passo) {
    const s = solar(lat, lon, tz, dia, h);
    if (s.alt <= 3) continue;
    const sa = s.alt * RAD;
    const G0 = 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * dia / 365));
    const DNI = G0 * Math.pow(0.7, Math.pow(1 / Math.sin(sa), 0.678));
    const dif = 0.11 * DNI * Math.sin(sa);
    const cosI = Math.max(0, nrm.dot(vetorSol(s.alt, s.azi)));
    const ct = Math.cos(tilt * RAD);
    const poa = DNI * cosI + dif * (1 + ct) / 2
              + (DNI * Math.sin(sa) + dif) * 0.2 * (1 - ct) / 2;
    soma += poa * passo / 1000;
  }
  return soma;
}

/** Média anual de irradiação diária sobre um plano (12 dias representativos). */
export function hspAnual(lat, lon, tz, tilt, azi) {
  let s = 0;
  for (let m = 0; m < 12; m++) s += irradDiaPlano(lat, lon, tz, Math.round(15 + m * 30.44), tilt, azi);
  return s / 12;
}

/** Inclinação e azimute ótimos para a latitude. */
export const planoIdeal = lat => ({ tilt: Math.abs(lat), azi: lat < 0 ? 0 : 180 });
