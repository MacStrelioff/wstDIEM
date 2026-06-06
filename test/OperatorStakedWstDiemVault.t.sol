// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {OperatorStakedWstDiemVault} from "../contracts/OperatorStakedWstDiemVault.sol";
import {TransferableWstDiem} from "../contracts/TransferableWstDiem.sol";

interface V1Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert(bytes calldata) external;
}

contract V1TestBase {
    V1Vm internal constant vm = V1Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 actual, uint256 expected, string memory label) internal pure {
        if (actual != expected) revert(string.concat(label, " mismatch"));
    }

    function assertEq(address actual, address expected, string memory label) internal pure {
        if (actual != expected) revert(string.concat(label, " mismatch"));
    }

    function assertTrue(bool value, string memory label) internal pure {
        if (!value) revert(string.concat(label, " not true"));
    }
}

contract V1MockDiem {
    string public constant name = "Mock DIEM";
    string public constant symbol = "mDIEM";
    uint8 public constant decimals = 18;

    struct StakedInfo {
        uint256 amountStaked;
        uint256 coolDownEnd;
        uint256 coolDownAmount;
    }

    uint256 public totalSupply;
    uint256 public totalStaked;
    uint256 public cooldownDuration = 1 days;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => StakedInfo) public stakedInfos;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ERC20: insufficient allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function stake(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "ERC20: transfer amount exceeds balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[address(this)] += amount;
        stakedInfos[msg.sender].amountStaked += amount;
        totalStaked += amount;
        emit Transfer(msg.sender, address(this), amount);
    }

    function initiateUnstake(uint256 amount) external {
        StakedInfo storage info = stakedInfos[msg.sender];
        require(info.amountStaked >= amount, "Diem: insufficient staked");
        info.amountStaked -= amount;
        info.coolDownAmount += amount;
        info.coolDownEnd = block.timestamp + cooldownDuration;
    }

    function unstake() external {
        StakedInfo storage info = stakedInfos[msg.sender];
        require(info.coolDownAmount > 0, "Diem: no cooldown");
        require(block.timestamp >= info.coolDownEnd, "Diem: cooldown active");
        uint256 amount = info.coolDownAmount;
        info.coolDownAmount = 0;
        info.coolDownEnd = 0;
        totalStaked -= amount;
        balanceOf[address(this)] -= amount;
        balanceOf[msg.sender] += amount;
        emit Transfer(address(this), msg.sender, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

contract OperatorStakedWstDiemVaultTest is V1TestBase {
    V1MockDiem internal diem;
    OperatorStakedWstDiemVault internal vault;
    TransferableWstDiem internal token;

    address internal constant OPERATOR = address(0x0A);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    function setUp() public {
        diem = new V1MockDiem();
        vault = new OperatorStakedWstDiemVault(address(diem), OPERATOR);
        token = TransferableWstDiem(vault.wstDiem());
        diem.mint(ALICE, 1_000 ether);
    }

    function testDepositMintsTransferableWstDiem() public {
        _approveDiemAs(ALICE, address(vault), 100 ether);
        _depositAs(ALICE, 100 ether);

        assertEq(token.balanceOf(ALICE), 100 ether, "alice shares");
        assertEq(token.totalSupply(), 100 ether, "share supply");
        assertEq(vault.totalPendingRedeemPrincipal(), 0, "pending liabilities");
        assertEq(diem.balanceOf(address(vault)), 100 ether, "vault liquid backing");

        vm.prank(ALICE);
        token.transfer(BOB, 25 ether);

        assertEq(token.balanceOf(ALICE), 75 ether, "alice after transfer");
        assertEq(token.balanceOf(BOB), 25 ether, "bob after transfer");
        assertTrue(vault.proofOfReserves().solvent, "solvent after transfer");
    }

    function testOperatorCanSweepAndStakeBackingWhileProofStaysSolvent() public {
        _approveDiemAs(ALICE, address(vault), 100 ether);
        _depositAs(ALICE, 100 ether);

        vm.prank(OPERATOR);
        vault.sweepToOperator(60 ether);
        assertEq(diem.balanceOf(OPERATOR), 60 ether, "operator liquid");

        vm.startPrank(OPERATOR);
        diem.approve(address(diem), 60 ether);
        diem.stake(60 ether);
        vm.stopPrank();

        OperatorStakedWstDiemVault.ProofOfReserves memory proof = vault.proofOfReserves();
        assertEq(proof.wstDiemSupply, 100 ether, "proof supply");
        assertEq(proof.operatorActiveStake, 60 ether, "proof operator stake");
        assertEq(proof.vaultLiquidDiem, 40 ether, "proof vault liquid");
        assertTrue(proof.solvent, "proof solvent");
    }

    function testRequestRedeemBurnsTransferredSharesAndClaimRequiresFundingAndCooldown() public {
        _approveDiemAs(ALICE, address(vault), 50 ether);
        _depositAs(ALICE, 50 ether);
        vm.prank(ALICE);
        token.transfer(BOB, 10 ether);

        vm.prank(BOB);
        uint256 requestId = vault.requestRedeem(10 ether);

        assertEq(token.balanceOf(BOB), 0, "bob shares burned");
        assertEq(vault.pendingRedeemPrincipal(BOB, requestId), 10 ether, "bob pending");
        assertEq(vault.totalPendingRedeemPrincipal(), 10 ether, "total pending");
        assertTrue(vault.proofOfReserves().solvent, "solvent after request");

        vm.expectRevert(bytes("REDEMPTION_NOT_FUNDED"));
        vm.prank(BOB);
        vault.claimRedeemed(requestId);

        _approveDiemAs(OPERATOR, address(vault), 10 ether);
        diem.mint(OPERATOR, 10 ether);
        vm.prank(OPERATOR);
        vault.fundRedemption(requestId);

        vm.expectRevert(bytes("COOLDOWN_ACTIVE"));
        vm.prank(BOB);
        vault.claimRedeemed(requestId);

        vm.warp(block.timestamp + 1 days);
        uint256 before = diem.balanceOf(BOB);
        vm.prank(BOB);
        vault.claimRedeemed(requestId);

        assertEq(diem.balanceOf(BOB), before + 10 ether, "bob claimed DIEM");
        assertEq(vault.pendingRedeemPrincipal(BOB, requestId), 0, "pending cleared");
        assertEq(vault.totalPendingRedeemPrincipal(), 0, "total pending cleared");
        assertTrue(vault.proofOfReserves().solvent, "solvent after claim");
    }

    function testOnlyOperatorCanSweepAndFund() public {
        _approveDiemAs(ALICE, address(vault), 10 ether);
        _depositAs(ALICE, 10 ether);

        vm.expectRevert(bytes("ONLY_OPERATOR"));
        vm.prank(ALICE);
        vault.sweepToOperator(1 ether);

        vm.prank(ALICE);
        uint256 requestId = vault.requestRedeem(1 ether);

        vm.expectRevert(bytes("ONLY_OPERATOR"));
        vm.prank(ALICE);
        vault.fundRedemption(requestId);
    }

    function _approveDiemAs(address owner, address spender, uint256 amount) internal {
        vm.prank(owner);
        diem.approve(spender, amount);
    }

    function _depositAs(address user, uint256 amount) internal {
        vm.prank(user);
        vault.deposit(amount);
    }
}
