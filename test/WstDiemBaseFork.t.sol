// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WstDiemVault} from "../contracts/WstDiemVault.sol";
import {WstDiem} from "../contracts/WstDiem.sol";

interface ForkVm {
    function envOr(string calldata name, string calldata defaultValue) external view returns (string memory);
    function createSelectFork(string calldata url) external returns (uint256);
    function prank(address) external;
}

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

interface IRealDiem {
    function cooldownDuration() external view returns (uint256);
    function stakedInfos(address user) external view returns (
        uint256 amountStaked,
        uint256 coolDownEnd,
        uint256 coolDownAmount
    );
}

contract WstDiemBaseForkTest {
    ForkVm internal constant vm = ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant DIEM = 0xF4d97F2da56e8c3098f3a8D538DB630A2606a024;
    address internal constant PROJECT_WALLET = 0x23bB05603A980C2915FC3B9D5D4a475993b666DE;

    function testVaultCanStakeRealDiemOnBaseFork() public {
        string memory rpc = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);

        IERC20Like diemToken = IERC20Like(DIEM);
        IRealDiem realDiem = IRealDiem(DIEM);
        require(diemToken.decimals() == 18, "DIEM_DECIMALS_CHANGED");
        require(realDiem.cooldownDuration() > 0, "DIEM_COOLDOWN_ZERO");

        uint256 walletBalance = diemToken.balanceOf(PROJECT_WALLET);
        require(walletBalance > 0, "PROJECT_WALLET_HAS_NO_DIEM");
        uint256 amount = walletBalance > 1e15 ? 1e15 : walletBalance / 2;
        require(amount > 0, "DIEM_AMOUNT_TOO_SMALL");

        WstDiemVault vault = new WstDiemVault(DIEM);
        WstDiem token = WstDiem(vault.wstDiem());

        vm.prank(PROJECT_WALLET);
        diemToken.approve(address(vault), amount);
        vm.prank(PROJECT_WALLET);
        vault.deposit(amount);

        (uint256 amountStaked, uint256 coolDownEnd, uint256 coolDownAmount) = realDiem.stakedInfos(address(vault));
        require(token.balanceOf(PROJECT_WALLET) == amount, "WST_MINT_MISMATCH");
        require(vault.totalActiveStake() == amount, "VAULT_ACTIVE_STAKE_MISMATCH");
        require(amountStaked == amount, "REAL_DIEM_STAKE_MISMATCH");
        require(coolDownEnd == 0, "UNEXPECTED_COOLDOWN_END");
        require(coolDownAmount == 0, "UNEXPECTED_COOLDOWN_AMOUNT");
        require(vault.accountingInvariantHolds(), "INVARIANT_FAILED");
    }
}
