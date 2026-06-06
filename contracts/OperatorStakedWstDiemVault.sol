// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TransferableWstDiem} from "./TransferableWstDiem.sol";

interface IOperatorDiem {
    function balanceOf(address user) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function cooldownDuration() external view returns (uint256);
    function stakedInfos(address user) external view returns (
        uint256 amountStaked,
        uint256 coolDownEnd,
        uint256 coolDownAmount
    );
}

/// @notice Operator-staked wstDIEM V1 vault.
/// @dev This contract tracks transferable wstDIEM shares and redemption claims while a
/// Venice-attributed operator EOA/Safe performs DIEM staking/unstaking offchain.
contract OperatorStakedWstDiemVault {
    struct RedemptionRequest {
        address owner;
        uint256 amount;
        uint256 readyAt;
        bool funded;
        bool claimed;
    }

    struct ProofOfReserves {
        uint256 wstDiemSupply;
        uint256 pendingRedeemPrincipal;
        uint256 operatorActiveStake;
        uint256 operatorCooldownAmount;
        uint256 operatorLiquidDiem;
        uint256 vaultLiquidDiem;
        uint256 totalBacking;
        uint256 totalLiabilities;
        bool solvent;
    }

    IOperatorDiem public immutable diem;
    TransferableWstDiem public immutable wstDiem;
    address public immutable operator;

    uint256 public nextRequestId = 1;
    uint256 public totalPendingRedeemPrincipal;
    uint256 public totalFundedRedeemPrincipal;

    mapping(uint256 => RedemptionRequest) public redemptionRequests;
    mapping(address => mapping(uint256 => uint256)) public pendingRedeemPrincipal;

    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event SweptToOperator(address indexed operator, uint256 amount);
    event RedeemRequested(address indexed user, uint256 indexed requestId, uint256 amount, uint256 readyAt);
    event RedemptionFunded(uint256 indexed requestId, uint256 amount);
    event RedeemClaimed(address indexed user, uint256 indexed requestId, uint256 amount);

    modifier onlyOperator() {
        require(msg.sender == operator, "ONLY_OPERATOR");
        _;
    }

    constructor(address diem_, address operator_) {
        require(diem_ != address(0), "ZERO_DIEM");
        require(operator_ != address(0), "ZERO_OPERATOR");
        diem = IOperatorDiem(diem_);
        operator = operator_;
        wstDiem = new TransferableWstDiem(address(this));
    }

    function deposit(uint256 assets) external returns (uint256 shares) {
        require(assets > 0, "ZERO_AMOUNT");
        require(diem.transferFrom(msg.sender, address(this), assets), "TRANSFER_FROM_FAILED");
        shares = assets;
        wstDiem.mint(msg.sender, shares);
        emit Deposited(msg.sender, assets, shares);
    }

    function sweepToOperator(uint256 amount) external onlyOperator {
        require(amount > 0, "ZERO_AMOUNT");
        require(diem.transfer(operator, amount), "TRANSFER_FAILED");
        emit SweptToOperator(operator, amount);
    }

    function requestRedeem(uint256 shares) external returns (uint256 requestId) {
        require(shares > 0, "ZERO_AMOUNT");
        wstDiem.burnFromVault(msg.sender, shares);

        uint256 readyAt = block.timestamp + diem.cooldownDuration();
        requestId = nextRequestId++;
        redemptionRequests[requestId] = RedemptionRequest({
            owner: msg.sender,
            amount: shares,
            readyAt: readyAt,
            funded: false,
            claimed: false
        });
        pendingRedeemPrincipal[msg.sender][requestId] = shares;
        totalPendingRedeemPrincipal += shares;

        emit RedeemRequested(msg.sender, requestId, shares, readyAt);
    }

    function fundRedemption(uint256 requestId) external onlyOperator {
        RedemptionRequest storage request = redemptionRequests[requestId];
        require(request.owner != address(0), "UNKNOWN_REQUEST");
        require(!request.funded, "REDEMPTION_FUNDED");
        require(!request.claimed, "REDEMPTION_CLAIMED");

        uint256 amount = request.amount;
        require(diem.transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM_FAILED");
        request.funded = true;
        totalFundedRedeemPrincipal += amount;

        emit RedemptionFunded(requestId, amount);
    }

    function claimRedeemed(uint256 requestId) external returns (uint256 amount) {
        RedemptionRequest storage request = redemptionRequests[requestId];
        require(request.owner == msg.sender, "NOT_REQUEST_OWNER");
        require(request.funded, "REDEMPTION_NOT_FUNDED");
        require(!request.claimed, "REDEMPTION_CLAIMED");
        require(block.timestamp >= request.readyAt, "COOLDOWN_ACTIVE");

        amount = request.amount;
        request.claimed = true;
        pendingRedeemPrincipal[msg.sender][requestId] = 0;
        totalPendingRedeemPrincipal -= amount;
        totalFundedRedeemPrincipal -= amount;
        require(diem.transfer(msg.sender, amount), "TRANSFER_FAILED");

        emit RedeemClaimed(msg.sender, requestId, amount);
    }

    function eligibleDiem(address user) external view returns (uint256) {
        return wstDiem.balanceOf(user);
    }

    function proofOfReserves() public view returns (ProofOfReserves memory proof) {
        (uint256 operatorActiveStake,, uint256 operatorCooldownAmount) = diem.stakedInfos(operator);
        uint256 operatorLiquidDiem = diem.balanceOf(operator);
        uint256 vaultLiquidDiem = diem.balanceOf(address(this));
        uint256 backing = operatorActiveStake + operatorCooldownAmount + operatorLiquidDiem + vaultLiquidDiem;
        uint256 liabilities = wstDiem.totalSupply() + totalPendingRedeemPrincipal;

        proof = ProofOfReserves({
            wstDiemSupply: wstDiem.totalSupply(),
            pendingRedeemPrincipal: totalPendingRedeemPrincipal,
            operatorActiveStake: operatorActiveStake,
            operatorCooldownAmount: operatorCooldownAmount,
            operatorLiquidDiem: operatorLiquidDiem,
            vaultLiquidDiem: vaultLiquidDiem,
            totalBacking: backing,
            totalLiabilities: liabilities,
            solvent: backing >= liabilities
        });
    }
}
