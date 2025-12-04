// FedCausalFHE.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FedCausalFHE is SepoliaConfig {
    struct EncryptedDataset {
        uint256 id;
        euint32 encryptedVariables;
        euint32 encryptedObservations;
        euint32 encryptedMetadata;
        uint256 timestamp;
    }
    
    struct CausalModel {
        euint32 encryptedGraphStructure;
        euint32 encryptedCausalEffects;
        euint32 encryptedConfidenceScores;
    }

    struct DecryptedDataset {
        string variables;
        string observations;
        string metadata;
        bool isRevealed;
    }

    uint256 public datasetCount;
    mapping(uint256 => EncryptedDataset) public encryptedDatasets;
    mapping(uint256 => DecryptedDataset) public decryptedDatasets;
    mapping(uint256 => CausalModel) public causalModels;
    
    mapping(uint256 => uint256) private requestToDatasetId;
    
    event DatasetSubmitted(uint256 indexed id, uint256 timestamp);
    event InferenceRequested(uint256 indexed datasetId);
    event ModelGenerated(uint256 indexed datasetId);
    event DecryptionRequested(uint256 indexed datasetId);
    event DatasetDecrypted(uint256 indexed datasetId);
    
    modifier onlyDataOwner(uint256 datasetId) {
        _;
    }
    
    function submitEncryptedDataset(
        euint32 encryptedVariables,
        euint32 encryptedObservations,
        euint32 encryptedMetadata
    ) public {
        datasetCount += 1;
        uint256 newId = datasetCount;
        
        encryptedDatasets[newId] = EncryptedDataset({
            id: newId,
            encryptedVariables: encryptedVariables,
            encryptedObservations: encryptedObservations,
            encryptedMetadata: encryptedMetadata,
            timestamp: block.timestamp
        });
        
        decryptedDatasets[newId] = DecryptedDataset({
            variables: "",
            observations: "",
            metadata: "",
            isRevealed: false
        });
        
        emit DatasetSubmitted(newId, block.timestamp);
    }
    
    function requestDatasetDecryption(uint256 datasetId) public onlyDataOwner(datasetId) {
        EncryptedDataset storage dataset = encryptedDatasets[datasetId];
        require(!decryptedDatasets[datasetId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(dataset.encryptedVariables);
        ciphertexts[1] = FHE.toBytes32(dataset.encryptedObservations);
        ciphertexts[2] = FHE.toBytes32(dataset.encryptedMetadata);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDataset.selector);
        requestToDatasetId[reqId] = datasetId;
        
        emit DecryptionRequested(datasetId);
    }
    
    function decryptDataset(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 datasetId = requestToDatasetId[requestId];
        require(datasetId != 0, "Invalid request");
        
        EncryptedDataset storage eDataset = encryptedDatasets[datasetId];
        DecryptedDataset storage dDataset = decryptedDatasets[datasetId];
        require(!dDataset.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dDataset.variables = results[0];
        dDataset.observations = results[1];
        dDataset.metadata = results[2];
        dDataset.isRevealed = true;
        
        emit DatasetDecrypted(datasetId);
    }
    
    function requestCausalInference(uint256 datasetId) public onlyDataOwner(datasetId) {
        require(encryptedDatasets[datasetId].id != 0, "Dataset not found");
        
        emit InferenceRequested(datasetId);
    }
    
    function submitCausalModel(
        uint256 datasetId,
        euint32 encryptedGraphStructure,
        euint32 encryptedCausalEffects,
        euint32 encryptedConfidenceScores
    ) public {
        causalModels[datasetId] = CausalModel({
            encryptedGraphStructure: encryptedGraphStructure,
            encryptedCausalEffects: encryptedCausalEffects,
            encryptedConfidenceScores: encryptedConfidenceScores
        });
        
        emit ModelGenerated(datasetId);
    }
    
    function requestModelDecryption(uint256 datasetId, uint8 modelComponent) public onlyDataOwner(datasetId) {
        CausalModel storage model = causalModels[datasetId];
        require(FHE.isInitialized(model.encryptedGraphStructure), "No model available");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        
        if (modelComponent == 0) {
            ciphertexts[0] = FHE.toBytes32(model.encryptedGraphStructure);
        } else if (modelComponent == 1) {
            ciphertexts[0] = FHE.toBytes32(model.encryptedCausalEffects);
        } else if (modelComponent == 2) {
            ciphertexts[0] = FHE.toBytes32(model.encryptedConfidenceScores);
        } else {
            revert("Invalid model component");
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptModelComponent.selector);
        requestToDatasetId[reqId] = datasetId * 10 + modelComponent;
    }
    
    function decryptModelComponent(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 compositeId = requestToDatasetId[requestId];
        uint256 datasetId = compositeId / 10;
        uint8 modelComponent = uint8(compositeId % 10);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string memory result = abi.decode(cleartexts, (string));
    }
    
    function getDecryptedDataset(uint256 datasetId) public view returns (
        string memory variables,
        string memory observations,
        string memory metadata,
        bool isRevealed
    ) {
        DecryptedDataset storage d = decryptedDatasets[datasetId];
        return (d.variables, d.observations, d.metadata, d.isRevealed);
    }
    
    function hasCausalModel(uint256 datasetId) public view returns (bool) {
        return FHE.isInitialized(causalModels[datasetId].encryptedGraphStructure);
    }
}