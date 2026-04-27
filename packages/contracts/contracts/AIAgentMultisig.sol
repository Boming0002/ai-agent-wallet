// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AIAgentMultisig
/// @notice Minimal 2-of-3 multisig for the AI Agent Wallet demo.
///         Signers and threshold are immutable. Operations are
///         identified by an off-chain digest = keccak256(abi.encode(this, op)),
///         where op = (to, value, data, nonce). Anyone may submit
///         execute(op, sigs[]) once enough signatures exist.
contract AIAgentMultisig {
    error InvalidSignerCount();
    error DuplicateSigner();
    error InvalidNonce();
    error InsufficientSignatures();
    error InvalidSignature();
    error CallFailed();
    error ZeroAddress();

    event Executed(bytes32 indexed opHash, address indexed to, uint256 value, uint256 nonce);

    address[3] public signers;
    uint256 public immutable required = 2;
    uint256 public nonce;

    constructor(address[3] memory _signers) {
        for (uint256 i = 0; i < 3; i++) {
            if (_signers[i] == address(0)) revert ZeroAddress();
            for (uint256 j = i + 1; j < 3; j++) {
                if (_signers[i] == _signers[j]) revert DuplicateSigner();
            }
        }
        signers = _signers;
    }

    struct Op {
        address to;
        uint256 value;
        bytes data;
        uint256 nonce;
    }

    function digest(Op calldata op) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), op.to, op.value, op.data, op.nonce));
    }

    function execute(Op calldata op, bytes[] calldata sigs) external returns (bytes memory ret) {
        if (op.nonce != nonce) revert InvalidNonce();
        if (sigs.length < required) revert InsufficientSignatures();
        bytes32 d = digest(op);
        bytes32 ethSigned = _toEthSignedMessageHash(d);

        // Track which signers have validated to prevent duplicates.
        bool[3] memory used;
        uint256 ok;
        for (uint256 i = 0; i < sigs.length; i++) {
            address rec = _recover(ethSigned, sigs[i]);
            for (uint256 s = 0; s < 3; s++) {
                if (!used[s] && signers[s] == rec) {
                    used[s] = true;
                    ok++;
                    break;
                }
            }
            if (ok >= required) break;
        }
        if (ok < required) revert InsufficientSignatures();

        nonce++;
        (bool success, bytes memory data) = op.to.call{value: op.value}(op.data);
        if (!success) revert CallFailed();
        emit Executed(d, op.to, op.value, op.nonce);
        return data;
    }

    receive() external payable {}

    // ---- internal ----
    function _toEthSignedMessageHash(bytes32 h) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
    }

    function _recover(bytes32 h, bytes memory sig) private pure returns (address) {
        if (sig.length != 65) revert InvalidSignature();
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(h, v, r, s);
    }

    function getSigners() external view returns (address[3] memory) {
        return signers;
    }
}
