import { describe } from 'mocha'
import chai, { assert, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { groth16 } from 'snarkjs'
import { TREE_DEPTH, attributeToPosition } from '../../common/src/constants/constants'
import { getPassportData } from '../../common/src/utils/passportData'
import { generateCircuitInputs } from '../../common/src/utils/generateInputs'
import path from 'path'
import fs from 'fs'
import { PassportData } from '../../common/src/utils/types'
import { getLeaf } from '../../common/src/utils/pubkeyTree'
import { IMT } from '@zk-kit/imt'
import { poseidon2 } from 'poseidon-lite'
const wasm_tester = require("circom_tester").wasm;

chai.use(chaiAsPromised)

console.log("The following snarkjs error logs are normal and expected if the tests pass.")

describe('Circuit tests', function () {
  this.timeout(0)

  let inputs: any;
  let passportData: PassportData;

  this.beforeAll(async () => {
    passportData = getPassportData();
    
    const serializedTree = JSON.parse(fs.readFileSync("../common/pubkeys/serialized_tree.json") as unknown as string)
    const tree = new IMT(poseidon2, TREE_DEPTH, 0, 2)
    tree.setNodes(serializedTree)

    // This adds the pubkey of the passportData to the registry even if it's not there for testing purposes.
    // Comment when testing with real passport data
    tree.insert(getLeaf({
      signatureAlgorithm: passportData.signatureAlgorithm,
      issuer: 'C = TS, O = Government of Syldavia, OU = Ministry of tests, CN = CSCA-TEST',
      modulus: passportData.pubKey.modulus,
      exponent: passportData.pubKey.exponent
    }))
    
    const reveal_bitmap = Array(88).fill('0');
    const address = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

    inputs = generateCircuitInputs(
      passportData,
      tree,
      reveal_bitmap,
      address
    );

    console.log('inputs', inputs)
  })
  
  describe('Proof', function() {
    it('should prove and verify with valid inputs', async function () {
      const { proof: zk_proof, publicSignals } = await groth16.fullProve(
        inputs,
        "build/proof_of_passport_js/proof_of_passport.wasm",
        "build/proof_of_passport_final.zkey"
      )
    
      // console.log('proof done');
      console.log('zk_proof', zk_proof);
      console.log('publicSignals', publicSignals);
    
      const vKey = JSON.parse(fs.readFileSync("build/proof_of_passport_vkey.json") as unknown as string);
      const verified = await groth16.verify(
        vKey,
        publicSignals,
        zk_proof
      )

      assert(verified == true, 'Should verify')
    
      console.log('verified', verified)
    })

    it('should fail to prove with invalid mrz', async function () {
      const invalidInputs = {
        ...inputs,
        mrz: inputs.mrz.map((byte: string) => String((parseInt(byte, 10) + 1) % 256)),
      }

      return expect(groth16.fullProve(
        invalidInputs,
        "build/proof_of_passport_js/proof_of_passport.wasm",
        "build/proof_of_passport_final.zkey"
      )).to.be.rejected;
    })

    it('should fail to prove with invalid eContentBytes', async function () {
      const invalidInputs = {
        ...inputs,
        eContentBytes: inputs.eContentBytes.map((byte: string) => String((parseInt(byte, 10) + 1) % 256)),
      }

      return expect(groth16.fullProve(
        invalidInputs,
        "build/proof_of_passport_js/proof_of_passport.wasm",
        "build/proof_of_passport_final.zkey"
      )).to.be.rejected;
    })
    
    it('should fail to prove with invalid signature', async function () {
      const invalidInputs = {
        ...inputs,
        signature: inputs.signature.map((byte: string) => String((parseInt(byte, 10) + 1) % 256)),
      }

      return expect(groth16.fullProve(
        invalidInputs,
        "build/proof_of_passport_js/proof_of_passport.wasm",
        "build/proof_of_passport_final.zkey"
      )).to.be.rejected;
    })

    it("shouldn't allow address maleability", async function () {
      const { proof, publicSignals } = await groth16.fullProve(
        inputs,
        "build/proof_of_passport_js/proof_of_passport.wasm",
        "build/proof_of_passport_final.zkey"
      )

      publicSignals[publicSignals.length - 1] = BigInt("0xC5B4F2A7Ea7F675Fca6EF724d6E06FFB40dFC93F").toString();

      const vKey = JSON.parse(fs.readFileSync("build/proof_of_passport_vkey.json").toString());
      return expect(await groth16.verify(
        vKey,
        publicSignals,
        proof
      )).to.be.false;
    })
  })

  describe('Selective disclosure', function() {
    const attributeCombinations = [
      ['issuing_state', 'name'],
      ['passport_number', 'nationality', 'date_of_birth'],
      ['gender', 'expiry_date'],
    ];

    attributeCombinations.forEach(combination => {
      it(`Disclosing ${combination.join(", ")}`, async function () {
        const attributeToReveal = Object.keys(attributeToPosition).reduce((acc, attribute) => {
          acc[attribute] = combination.includes(attribute);
          return acc;
        }, {});
  
        const bitmap = Array(88).fill('0');

        Object.entries(attributeToReveal).forEach(([attribute, reveal]) => {
          if (reveal) {
            const [start, end] = attributeToPosition[attribute];
            bitmap.fill('1', start, end + 1);
          }
        });
  
        inputs = {
          ...inputs,
          reveal_bitmap: bitmap.map(String),
        }
  
        const { proof, publicSignals } = await groth16.fullProve(
          inputs,
          "build/proof_of_passport_js/proof_of_passport.wasm",
          "build/proof_of_passport_final.zkey"
        )
  
        console.log('proof done');
  
        const vKey = JSON.parse(fs.readFileSync("build/proof_of_passport_vkey.json").toString());
        const verified = await groth16.verify(
          vKey,
          publicSignals,
          proof
        )
  
        assert(verified == true, 'Should verifiable')
  
        console.log('proof verified');
  
        const firstThreeElements = publicSignals.slice(0, 3);
        const bytesCount = [31, 31, 26]; // nb of bytes in each of the first three field elements
  
        const bytesArray = firstThreeElements.flatMap((element: string, index: number) => {
          const bytes = bytesCount[index];
          const elementBigInt = BigInt(element);
          const byteMask = BigInt(255); // 0xFF
        
          const bytesOfElement = [...Array(bytes)].map((_, byteIndex) => {
            return (elementBigInt >> (BigInt(byteIndex) * BigInt(8))) & byteMask;
          });
        
          return bytesOfElement;
        });
        
        const result = bytesArray.map((byte: bigint) => String.fromCharCode(Number(byte)));
  
        console.log(result);
  
        for(let i = 0; i < result.length; i++) {
          if (bitmap[i] == '1') {
            const char = String.fromCharCode(Number(inputs.mrz[i + 5]));
            assert(result[i] == char, 'Should reveal the right one');
          } else {
            assert(result[i] == '\x00', 'Should not reveal');
          }
        }
      });
    });
  })

  // use these tests with .only to check changes without rebuilding the zkey
  describe('Circom tester tests', function() {
    it('should prove and verify with valid inputs', async function () {
      const circuit = await wasm_tester(
        path.join(__dirname, `../circuits/proof_of_passport.circom`),
        { include: ["node_modules"] },
      );
      const w = await circuit.calculateWitness(inputs);
      await circuit.checkConstraints(w);
    })
  })

})


