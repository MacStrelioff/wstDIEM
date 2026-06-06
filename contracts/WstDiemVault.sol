// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WstDiem} from "./WstDiem.sol";

interface IDiem {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function stake(uint256 amount) external;
    function initiateUnstake(uint256 amount) external;
    function unstake() external;
    function cooldownDuration() external view returns (uint256);
    function stakedInfos(address user) external view returns (
        uint256 amountStaked,
        uint256 coolDownEnd,
        uint256 coolDownAmount
    );
}

/// @notice Minimal ownerless vault that stakes DIEM and mints non-transferable wstDIEM 1:1.
/// @dev This V1 supports one active cooldown batch at a time to avoid resetting DIEM's
/// single cooldown bucket and griefing earlier redeemers.
contract WstDiemVault {
    struct RedeemBatch {
        uint256 amount;
        uint256 readyAt;
        bool completed;
    }

    IDiem public immutable diem;
    WstDiem public immutable wstDiem;

    uint256 public nextBatchId = 1;
    uint256 public activeBatchId;
    uint256 public totalActiveStake;
    uint256 public totalPendingRedeemPrincipal;
    uint256 public totalCooldownPrincipal;
    uint256 public totalLiquidClaimReserve;

    mapping(uint256 => RedeemBatch) public redeemBatches;
    mapping(address => mapping(uint256 => uint256)) public pendingRedeemPrincipal;

    event Deposited(address indexed user, uint256 amount);
    event RedeemRequested(address indexed user, uint256 indexed batchId, uint256 amount, uint256 readyAt);
    event UnstakeBatchCompleted(uint256 indexed batchId, uint256 amount);
    event RedeemClaimed(address indexed user, uint256 indexed batchId, uint256 amount);

    constructor(address diem_) {
        require(diem_ != address(0), "ZERO_DIEM");
        diem = IDiem(diem_);
        wstDiem = new WstDiem(address(this));
    }

    function deposit(uint256 amount) external returns (uint256 wstDiemMinted) {
        require(amount > 0, "ZERO_AMOUNT");
        require(diem.transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAILED");
        diem.stake(amount);
        totalActiveStake += amount;
        wstDiem.mint(msg.sender, amount);
        emit Deposited(msg.sender, amount);
        return amount;
    }

    function requestRedeem(uint256 amount) external returns (uint256 batchId) {
        require(amount > 0, "ZERO_AMOUNT");
        require(activeBatchId == 0, "ACTIVE_COOLDOWN");

        wstDiem.burnFromVault(msg.sender, amount);
        totalActiveStake -= amount;
        totalPendingRedeemPrincipal += amount;
        totalCooldownPrincipal += amount;

        batchId = nextBatchId++;
        diem.initiateUnstake(amount);
        (, uint256 readyAt, uint256 cooldownAmount) = diem.stakedInfos(address(this));
        require(cooldownAmount >= amount, "DIEM_COOLDOWN_MISMATCH");

        redeemBatches[batchId] = RedeemBatch({amount: amount, readyAt: readyAt, completed: false});
        pendingRedeemPrincipal[msg.sender][batchId] = amount;
        activeBatchId = batchId;

        emit RedeemRequested(msg.sender, batchId, amount, readyAt);
    }

    function completeUnstakeBatch(uint256 batchId) external {
        require(batchId != 0 && batchId == activeBatchId, "NOT_ACTIVE_BATCH");
        RedeemBatch storage batch = redeemBatches[batchId];
        require(!batch.completed, "BATCH_COMPLETED");
        require(block.timestamp >= batch.readyAt, "COOLDOWN_ACTIVE");

        uint256 amount = batch.amount;
        diem.unstake();
        batch.completed = true;
        activeBatchId = 0;
        totalCooldownPrincipal -= amount;
        totalLiquidClaimReserve += amount;

        emit UnstakeBatchCompleted(batchId, amount);
    }

    function claimRedeemed(uint256 batchId) external returns (uint256 amount) {
        RedeemBatch storage batch = redeemBatches[batchId];
        require(batch.completed, "BATCH_NOT_CLAIMABLE");
        amount = pendingRedeemPrincipal[msg.sender][batchId];
        require(amount > 0, "NOTHING_TO_CLAIM");

        pendingRedeemPrincipal[msg.sender][batchId] = 0;
        totalPendingRedeemPrincipal -= amount;
        totalLiquidClaimReserve -= amount;
        require(diem.transfer(msg.sender, amount), "TRANSFER_FAILED");

        emit RedeemClaimed(msg.sender, batchId, amount);
    }

    function eligibleDiem(address user) external view returns (uint256) {
        return wstDiem.balanceOf(user);
    }

    function activeCooldownStatus() external view returns (uint256 batchId, uint256 amount, uint256 readyAt) {
        batchId = activeBatchId;
        if (batchId != 0) {
            RedeemBatch storage batch = redeemBatches[batchId];
            amount = batch.amount;
            readyAt = batch.readyAt;
        }
    }

    function accountingInvariantHolds() external view returns (bool) {
        return wstDiem.totalSupply() + totalPendingRedeemPrincipal
            == totalActiveStake + totalCooldownPrincipal + totalLiquidClaimReserve;
    }
}
