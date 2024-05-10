import { describe } from 'mocha'
import { assert, expect } from 'chai'
import path from "path";
const wasm_tester = require("circom_tester").wasm;
import { poseidon1, poseidon4, poseidon6 } from "poseidon-lite";
import { mockPassportData_sha256WithRSAEncryption_65537 } from "../../common/src/utils/mockPassportData";
import { generateCircuitInputsRegister } from '../../common/src/utils/generateInputs';
import { formatMrz } from "../../common/src/utils/utils";
import { buildPoseidon } from 'circomlibjs';
import { getLeaf } from '../../common/src/utils/pubkeyTree';

describe("Proof of Passport - Circuits - Register flow", function () {
    this.timeout(0);
    let inputs: any;
    let circuit: any;
    let passportData = mockPassportData_sha256WithRSAEncryption_65537;
    let attestation_id: string;

    before(async () => {
        circuit = await wasm_tester(
            path.join(__dirname, "../circuits/register_sha256WithRSAEncryption_65537.circom"),
            { include: ["node_modules"] },
        );

        const secret = BigInt(Math.floor(Math.random() * Math.pow(2, 254))).toString();
        console.log("secret", secret);

        const attestation_name = "E-PASSPORT";
        attestation_id = poseidon1([
            BigInt(Buffer.from(attestation_name).readUIntBE(0, 6))
        ]).toString();

        inputs = generateCircuitInputsRegister(
            secret,
            attestation_id,
            passportData,
            { developmentMode: true }
        );

        console.log(JSON.stringify(inputs, null, 2));
    });

    it("should compile and load the circuit", async function () {
        expect(circuit).to.not.be.undefined;
    });
    it("calculate witness", async function () {
        w = await circuit.calculateWitness(inputs);
        let commitment_circom = await circuit.getOutput(w, ["commitment"]);
        commitment_circom = commitment_circom.commitment;
        const formattedMrz = formatMrz(inputs.mrz);
        const mrz_bytes = packBytes(formattedMrz);
        console.log(inputs.secret)
        console.log(formattedMrz)
        console.log('mrz_bytes', mrz_bytes)
        const commitment_js = poseidon4([inputs.secret, mrz_bytes[0], mrz_bytes[1], mrz_bytes[2]]);
        //const commitment_js = poseidon.F.toString(commitment_bytes);
        console.log('commitment_js', commitment_js)
        console.log('commitment_circom', commitment_circom)
        expect(commitment_circom).to.be.equal(commitment_js);
    });

    it("should fail to calculate witness with invalid mrz", async function () {
        try {
            const invalidInputs = {
                ...inputs,
                mrz: Array(93).fill(0).map(byte => BigInt(byte).toString())
            }
            await circuit.calculateWitness(invalidInputs);
            expect.fail("Expected an error but none was thrown.");
        } catch (error) {
            expect(error.message).to.include("Assert Failed");
        }
    });

    it("should fail to calculate witness with invalid econtent", async function () {
        try {
            const invalidInputs = {
                ...inputs,
                econtent: inputs.econtent.map((byte: string) => String((parseInt(byte, 10) + 1) % 256)),
            }
            await circuit.calculateWitness(invalidInputs);
            expect.fail("Expected an error but none was thrown.");
        } catch (error) {
            expect(error.message).to.include("Assert Failed");
        }
    });

    it("should fail to calculate witness with invalid signature", async function () {
        try {
            const invalidInputs = {
                ...inputs,
                signature: inputs.signature.map((byte: string) => String((parseInt(byte, 10) + 1) % 256)),
            }
            await circuit.calculateWitness(invalidInputs);
            expect.fail("Expected an error but none was thrown.");
        } catch (error) {
            expect(error.message).to.include("Assert Failed");
        }
    });

    it("should fail to calculate witness with invalid merkle root", async function () {
        try {
            const invalidInputs = {
                ...inputs,
                merkle_root: inputs.merkle_root.map((byte: string) => String((parseInt(byte, 10) + 1) % 256)),
            }
            await circuit.calculateWitness(invalidInputs);
            expect.fail("Expected an error but none was thrown.");
        } catch (error) {
            expect(error.message).to.include("Assert Failed");
        }
    });

});



function packBytes(unpacked) {
    const bytesCount = [31, 31, 31];
    let packed = [0n, 0n, 0n];

    let byteIndex = 0;
    for (let i = 0; i < bytesCount.length; i++) {
        for (let j = 0; j < bytesCount[i]; j++) {
            if (byteIndex < unpacked.length) {
                packed[i] |= BigInt(unpacked[byteIndex]) << (BigInt(j) * 8n);
            }
            byteIndex++;
        }
    }
    return packed;
}