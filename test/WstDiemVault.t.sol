// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WstDiemVault} from "../contracts/WstDiemVault.sol";
import {WstDiem} from "../contracts/WstDiem.sol";

interface Vm {
    function expectRevert(bytes calldata) external;
    function prank(address) external;
    function warp(uint256) external;
}

contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

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

contract MockDiem {
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
    event Staked(address indexed user, uint256 amount);
    event UnstakeInitiated(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);

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
        emit Staked(msg.sender, amount);
    }

    function initiateUnstake(uint256 amount) external {
        StakedInfo storage info = stakedInfos[msg.sender];
        require(info.amountStaked >= amount, "Diem: insufficient staked");
        info.amountStaked -= amount;
        info.coolDownAmount += amount;
        info.coolDownEnd = block.timestamp + cooldownDuration;
        emit UnstakeInitiated(msg.sender, amount);
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
        emit Unstaked(msg.sender, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

contract WstDiemVaultTest is TestBase {
    MockDiem internal diem;
    WstDiemVault internal vault;
    WstDiem internal token;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    function setUp() public {
        diem = new MockDiem();
        vault = new WstDiemVault(address(diem));
        token = WstDiem(vault.wstDiem());
        diem.mint(ALICE, 1_000 ether);
    }

    function testDepositStakesDiemAndMintsWstDiem() public {
        _approveAs(ALICE, address(vault), 100 ether);
        _depositAs(ALICE, 100 ether);

        assertEq(token.balanceOf(ALICE), 100 ether, "alice wstDIEM");
        assertEq(token.totalSupply(), 100 ether, "wstDIEM supply");
        assertEq(vault.totalActiveStake(), 100 ether, "active stake");
        assertEq(diem.balanceOf(address(vault)), 0, "vault liquid DIEM");

        (uint256 amountStaked, uint256 coolDownEnd, uint256 coolDownAmount) = diem.stakedInfos(address(vault));
        assertEq(amountStaked, 100 ether, "DIEM stakedInfos amount");
        assertEq(coolDownEnd, 0, "coolDownEnd");
        assertEq(coolDownAmount, 0, "coolDownAmount");
        assertTrue(vault.accountingInvariantHolds(), "invariant after deposit");
    }

    function testWstDiemIsNonTransferableForV1() public {
        _approveAs(ALICE, address(vault), 10 ether);
        _depositAs(ALICE, 10 ether);

        vm.expectRevert(bytes("NON_TRANSFERABLE"));
        _transferWstAs(ALICE, BOB, 1 ether);
    }

    function testRequestRedeemBurnsEligibilityAndStartsCooldownBatch() public {
        _approveAs(ALICE, address(vault), 100 ether);
        _depositAs(ALICE, 100 ether);

        _requestRedeemAs(ALICE, 40 ether);

        assertEq(token.balanceOf(ALICE), 60 ether, "alice active wstDIEM");
        assertEq(token.totalSupply(), 60 ether, "supply after burn");
        assertEq(vault.pendingRedeemPrincipal(ALICE, 1), 40 ether, "pending redeem");
        assertEq(vault.totalActiveStake(), 60 ether, "active stake after initiate");
        assertEq(vault.totalCooldownPrincipal(), 40 ether, "cooldown principal");
        assertEq(vault.eligibleDiem(ALICE), 60 ether, "eligible DIEM");

        (uint256 amountStaked, uint256 coolDownEnd, uint256 coolDownAmount) = diem.stakedInfos(address(vault));
        assertEq(amountStaked, 60 ether, "DIEM active staked amount");
        assertEq(coolDownEnd, block.timestamp + 1 days, "cooldown end");
        assertEq(coolDownAmount, 40 ether, "DIEM cooldown amount");
        assertTrue(vault.accountingInvariantHolds(), "invariant after redeem");
    }

    function testCompleteAndClaimAfterCooldown() public {
        _approveAs(ALICE, address(vault), 20 ether);
        _depositAs(ALICE, 20 ether);
        _requestRedeemAs(ALICE, 5 ether);

        vm.warp(block.timestamp + 1 days);
        vault.completeUnstakeBatch(1);
        uint256 beforeClaim = diem.balanceOf(ALICE);
        _claimAs(ALICE, 1);

        assertEq(diem.balanceOf(ALICE), beforeClaim + 5 ether, "claimed DIEM");
        assertEq(vault.pendingRedeemPrincipal(ALICE, 1), 0, "pending cleared");
        assertEq(vault.totalLiquidClaimReserve(), 0, "reserve drained");
        assertTrue(vault.accountingInvariantHolds(), "invariant after claim");
    }

    function _approveAs(address owner, address spender, uint256 amount) internal {
        vm.prank(owner);
        diem.approve(spender, amount);
    }

    function _depositAs(address user, uint256 amount) internal {
        vm.prank(user);
        vault.deposit(amount);
    }

    function _requestRedeemAs(address user, uint256 amount) internal {
        vm.prank(user);
        vault.requestRedeem(amount);
    }

    function _claimAs(address user, uint256 batchId) internal {
        vm.prank(user);
        vault.claimRedeemed(batchId);
    }

    function _transferWstAs(address from, address to, uint256 amount) internal {
        vm.prank(from);
        token.transfer(to, amount);
    }
}
