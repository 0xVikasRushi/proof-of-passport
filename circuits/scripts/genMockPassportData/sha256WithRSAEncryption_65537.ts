import assert from "assert";
import { PassportData } from "../../../common/src/utils/types";
import { hash, assembleEContent, formatAndConcatenateDataHashes, formatMrz, hexToDecimal, arraysAreEqual } from "../../../common/src/utils/utils";
import * as forge from 'node-forge';
import { writeFileSync } from "fs";

const sampleMRZ = "P<FRADUPONT<<ALPHONSE<HUGUES<ALBERT<<<<<<<<<24HB818324FRA0402111M3111115<<<<<<<<<<<<<<02"
const sampleDataHashes_256 = [
  [
    2,
    [-66, 82, -76, -21, -34, 33, 79, 50, -104, -120, -114, 35, 116, -32, 6, -14, -100, -115, -128, -8, 10, 61, 98, 86, -8, 45, -49, -46, 90, -24, -81, 38]
  ],
  [
    3,
    [0, -62, 104, 108, -19, -10, 97, -26, 116, -58, 69, 110, 26, 87, 17, 89, 110, -57, 108, -6, 36, 21, 39, 87, 110, 102, -6, -43, -82, -125, -85, -82]
  ],
  [
    11,
    [-120, -101, 87, -112, 111, 15, -104, 127, 85, 25, -102, 81, 20, 58, 51, 75, -63, 116, -22, 0, 60, 30, 29, 30, -73, -115, 72, -9, -1, -53, 100, 124]
  ],
  [
    12,
    [41, -22, 106, 78, 31, 11, 114, -119, -19, 17, 92, 71, -122, 47, 62, 78, -67, -23, -55, -42, 53, 4, 47, -67, -55, -123, 6, 121, 34, -125, 64, -114]
  ],
  [
    13,
    [91, -34, -46, -63, 62, -34, 104, 82, 36, 41, -118, -3, 70, 15, -108, -48, -100, 45, 105, -85, -15, -61, -71, 43, -39, -94, -110, -55, -34, 89, -18, 38]
  ],
  [
    14,
    [76, 123, -40, 13, 51, -29, 72, -11, 59, -63, -18, -90, 103, 49, 23, -92, -85, -68, -62, -59, -100, -69, -7, 28, -58, 95, 69, 15, -74, 56, 54, 38]
  ]
]
const signatureAlgorithm = 'sha256WithRSAEncryption'

export function genMockPassportData_sha256WithRSAEncryption_65537(): PassportData {
  const mrzHash = hash(signatureAlgorithm, formatMrz(sampleMRZ));
  sampleDataHashes_256.unshift([1, mrzHash]);
  const concatenatedDataHashes = formatAndConcatenateDataHashes(
    mrzHash,
    sampleDataHashes_256 as [number, number[]][],
  );

  const eContent = assembleEContent(hash(signatureAlgorithm, concatenatedDataHashes));

  const rsa = forge.pki.rsa;
  const privKey = rsa.generateKeyPair({ bits: 2048 }).privateKey;
  const modulus = privKey.n.toString(16);

  const md = forge.md.sha256.create();
  md.update(forge.util.binary.raw.encode(new Uint8Array(eContent)));

  const signature = privKey.sign(md)
  const signatureBytes = Array.from(signature, (c: string) => c.charCodeAt(0));

  return {
    mrz: sampleMRZ,
    signatureAlgorithm: signatureAlgorithm,
    pubKey: {
      modulus: hexToDecimal(modulus),
      exponent: '65537',
    },
    dataGroupHashes: concatenatedDataHashes,
    eContent: eContent,
    encryptedDigest: signatureBytes,
    photoBase64: "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABjElEQVR42mL8//8/AyUYiBQYmIw3..."
  }
}

function verify(passportData: PassportData): boolean {
  const { mrz, signatureAlgorithm, pubKey, dataGroupHashes, eContent, encryptedDigest } = passportData;
  const formattedMrz = formatMrz(mrz);
  const mrzHash = hash(signatureAlgorithm, formattedMrz);

  assert(
    arraysAreEqual(mrzHash, dataGroupHashes.slice(31, 31 + mrzHash.length)),
    'mrzHash is at the right place in dataGroupHashes'
  );

  const modulus = new forge.jsbn.BigInteger(pubKey.modulus, 10);
  const exponent = new forge.jsbn.BigInteger(pubKey.exponent, 10);
  const rsaPublicKey = forge.pki.rsa.setPublicKey(modulus, exponent);

  const md = forge.md.sha256.create();
  md.update(forge.util.binary.raw.encode(new Uint8Array(eContent)));

  const signature = String.fromCharCode(...encryptedDigest);

  return rsaPublicKey.verify(md.digest().bytes(), signature);
}

const mockPassportData = genMockPassportData_sha256WithRSAEncryption_65537();
console.log("Passport Data:", JSON.stringify(mockPassportData, null, 2));
console.log("Signature valid:", verify(mockPassportData));

writeFileSync(__dirname + '/passportData.json', JSON.stringify(mockPassportData, null, 2));