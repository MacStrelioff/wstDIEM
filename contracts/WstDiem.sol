// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Non-transferable ERC-20-compatible receipt token for staked DIEM.
/// @dev V1 deliberately blocks transfers to prevent same-epoch Venice allowance double-spend.
contract WstDiem {
    string public constant name = "Wrapped Staked DIEM";
    string public constant symbol = "wstDIEM";
    uint8 public constant decimals = 18;

    address public immutable vault;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    error OnlyVault();

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address vault_) {
        require(vault_ != address(0), "ZERO_VAULT");
        vault = vault_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address, uint256) external pure returns (bool) {
        revert("NON_TRANSFERABLE");
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert("NON_TRANSFERABLE");
    }

    function mint(address to, uint256 amount) external onlyVault {
        require(to != address(0), "ZERO_TO");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burnFromVault(address from, uint256 amount) external onlyVault {
        require(balanceOf[from] >= amount, "INSUFFICIENT_WSTDIEM");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}
