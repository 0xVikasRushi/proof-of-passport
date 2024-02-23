import { describe } from 'mocha'
import chai, { assert } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { groth16 } from 'snarkjs'
import fs from 'fs'
import { IMT } from "@zk-kit/imt"
import { poseidon12, poseidon2, poseidon8 } from "poseidon-lite"
import { genSampleData } from '../../common/src/utils/passportData'
import { bigIntToChunkedBytes, formatSigAlg } from '../../common/src/utils/utils'
import { buildPubkeyTree } from '../../common/src/utils/pubkeyTree'

chai.use(chaiAsPromised)

const DEV = true
const depth = 16
const zeroValue = 0

enum SignatureAlgorithm {
  sha256WithRSAEncryption_65537 = 1,
  sha256WithRSAEncryption_3 = 2,
  sha1WithRSAEncryption_65537 = 3,
  rsassaPss_65537 = 4,
  rsassaPss_3 = 5,
  ecdsa_with_SHA384 = 6,
  ecdsa_with_SHA1 = 7,
  ecdsa_with_SHA256 = 8,
  ecdsa_with_SHA512 = 9,
  sha512WithRSAEncryption_65537 = 10
}

describe('Merkle tree tests', function () {
  this.timeout(0)

  let tree: IMT;
  let pubkeys = JSON.parse(fs.readFileSync("../common/pubkeys/publicKeysParsed.json") as unknown as string)
  const passportData = genSampleData();

  this.beforeAll(async () => {
    // log niche exponents
    // for(let i = 0; i < pubkeys.length; i++) {
    //   if (pubkeys[i].exponent && pubkeys[i].exponent !== '65537') {
    //     console.log('i:', i, pubkeys[i].signatureAlgorithm, pubkeys[i].exponent);
    //   }
    // }
    
    // log ecdsa pubkeys
    // for(let i = 0; i < pubkeys.length; i++) {
    //   if (!pubkeys[i].exponent) {
    //     console.log('i:', i, pubkeys[i]);
    //   }
    // }

    console.log('passportData.pubKey', passportData.pubKey)

    if (DEV) {
      pubkeys = pubkeys.slice(0, 100);

      pubkeys.push({
        signatureAlgorithm: passportData.signatureAlgorithm,
        issuer: 'C = TS, O = Government of Syldavia, OU = Ministry of tests, CN = CSCA-TEST',
        modulus: passportData.pubKey.modulus,
        exponent: passportData.pubKey.exponent
      })
    }

    tree = buildPubkeyTree(pubkeys)
  })
  
  describe.skip('Tree only', function() {
    it('should prove and verify with valid inputs', async function () {
      const sigAlgFormatted = formatSigAlg(passportData.signatureAlgorithm, passportData.pubKey.exponent)
      const pubkeyChunked = bigIntToChunkedBytes(BigInt(passportData.pubKey.modulus as string), 192, 11);
      const leaf = poseidon12([SignatureAlgorithm[sigAlgFormatted], ...pubkeyChunked])

      console.log('leaf', leaf)

      const index = tree.indexOf(leaf)

      console.log('index', index)

      const proof = tree.createProof(index)
      console.log("proof", proof)
      console.log("verifyProof", tree.verifyProof(proof))
  
      const inputs = {
        leaf: proof.leaf,
        pathIndices: proof.pathIndices,
        siblings: proof.siblings.flat(),
      }
    
      console.log('inputs', inputs)
  
      const { proof: zk_proof, publicSignals } = await groth16.fullProve(
        inputs,
        "build/only_tree_js/only_tree.wasm",
        "build/only_tree_final.zkey"
      )
    
      // console.log('proof done');
      console.log('zk_proof', zk_proof);
      console.log('publicSignals', publicSignals);
    
      const vKey = JSON.parse(fs.readFileSync("build/only_tree_verification_key.json") as unknown as string);
      const verified = await groth16.verify(
        vKey,
        publicSignals,
        zk_proof
      )

      assert(verified == true, 'Should verifiable')
      assert(publicSignals[0] == tree.root, 'Should be 125')
    
      console.log('verified', verified)

      console.log('publicSignals[0]', publicSignals[0])
      console.log('tree.root', tree.root)
    })
  })
})